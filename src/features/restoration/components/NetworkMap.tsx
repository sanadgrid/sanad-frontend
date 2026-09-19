import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, type RefObject } from 'react'
import type { StationPoint } from '../backup/directory'
import type { Layers } from '../filters'
import { layerColor } from '../layerPalette'
import { themeColors, type MapColors } from '../mapTheme'
import { mapTiles } from '../mapTiles'
import type { LatLng } from '../types'
import type { VisibleLayer } from '../useMapLayers'
import type { Theme } from '../useTheme'
import {
  describeOnMap,
  drawImportedLayer,
  IMPORTED_PANE,
  IMPORTED_PANE_Z,
  openDetail,
  paintImportedLayer,
  settleStations,
  setDetail,
  type DrawnImportedLayer,
} from './importedLayer'
import { fitBbox, fitPoints, flyToPoint, followClearArea, panTo, patientFit, type MapView, type Place } from './mapView'
import { drawNetwork, LABEL_PANE, LABEL_PANE_Z, type MapStation, type MapTie, type Themed } from './networkLayers'
import { drawPickLayer, PICK_PANE, PICK_PANE_Z, pointOut, type PickLayer } from './pickLayer'
import { drawPlans, PLAN_PANE, PLAN_PANE_Z, type PlanDrawing } from './planLinks'

interface NetworkMapProps {
  center: LatLng
  zoom: number
  stations: MapStation[]
  ties: MapTie[]
  layers: Layers
  /** Imported layers that are ticked and loaded, drawn under the network. */
  imported: VisibleLayer[]
  /** Set to move the map; a new object moves it again. */
  view: MapView | null
  /** The part of the map that no panel covers: views are aimed at it. */
  clearArea: RefObject<HTMLElement | null>
  selectedId: string | null
  /** Ties to mark: those of the feeder whose loss is being looked at. */
  highlightTies: ReadonlySet<string>
  /** Backup plans to draw, between the imported layers and the network. */
  plans: PlanDrawing[]
  /** What the map keeps in view while the network has no stations to show: a plan, or the imported stations. */
  frame: LatLng[]
  /** Set while the stations of a plan are being clicked on the map: every station that can be. */
  pickable: StationPoint[] | null
  /** Of those, the backups the plan holds (by `pointKey`): their badge stands in for their square. */
  pickedBackups: string[]
  /** A place to point out: the option of a duplicate number under the pointer. */
  pointedOut: LatLng | null
  theme: Theme
  onSelect: (stationId: string) => void
  onSelectPlan: (planId: string) => void
  onPick: (point: StationPoint) => void
}

interface DrawnLayer extends DrawnImportedLayer {
  /** What the group was built from: a re-import brings a new array, a re-render does not. */
  features: VisibleLayer['features']
  color: string
}

/** The place the list last pointed at, and its popup. */
interface Pointed {
  layerId: string
  place: Place
  popup: L.Popup
  /** The layer has been on the map since: when it goes, so does the popup. */
  drawn: boolean
}

// The index knows a station by its name and place only; the rest of its popup
// comes from the layer itself, as soon as that is on the map.
function completeDetail(at: Pointed, features: VisibleLayer['features'] | undefined) {
  if (!features) return
  at.drawn = true
  if (!at.place.partial) return
  const { text } = at.place
  const [lng, lat] = at.place.at
  const found = features.find((f) => f.t === 'p' && f.c[0] === lng && f.c[1] === lat && f.n.trim() === text.n)
  if (found) setDetail(at.popup, found)
  at.place = { ...at.place, partial: false }
}

// from the zoom a fitted sector opens at: further out, the names pile up on each other
const LABEL_ZOOM = 11

export function NetworkMap({
  center,
  zoom,
  stations,
  ties,
  layers,
  imported,
  view,
  clearArea,
  selectedId,
  highlightTies,
  plans,
  frame,
  pickable,
  pickedBackups,
  pointedOut,
  theme,
  onSelect,
  onSelectPlan,
  onPick,
}: NetworkMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const overlay = useRef<L.LayerGroup | null>(null)
  const planLinks = useRef<L.LayerGroup | null>(null)
  // thousands of imported shapes are painted on one canvas instead of one SVG node each
  const canvas = useRef<L.Renderer | null>(null)
  const drawn = useRef(new Map<string, DrawnLayer>())
  const pointed = useRef<Pointed | null>(null)
  const pickLayer = useRef<PickLayer | null>(null)
  // the latest values, for handlers and for views asked long after the markers were drawn
  const select = useRef(onSelect)
  const selectPlan = useRef(onSelectPlan)
  const pick = useRef(onPick)
  // what a fitted view frames: the network's stations, or what stands in for them
  const networkShown = stations.length > 0
  const framedPoints = useRef(frame)
  const shown = useRef(stations)
  useEffect(() => {
    select.current = onSelect
    selectPlan.current = onSelectPlan
    pick.current = onPick
    shown.current = stations
    framedPoints.current = networkShown ? stations.map((s) => s.location) : frame
  }, [onSelect, onSelectPlan, onPick, stations, networkShown, frame])

  // Until the user moves the map himself, it keeps the stations framed in whatever
  // room the panels leave: opening the filters slides the network aside, not under them.
  const framed = useRef(true)

  // Every colour goes through a painter, so a change of theme restyles the
  // layers that exist: no redraw, and the map keeps its view and its tiles.
  const colors = useRef(themeColors(theme))
  const painters = useRef<((c: MapColors) => void)[]>([])
  useEffect(() => {
    colors.current = themeColors(theme)
    for (const paint of painters.current) paint(colors.current)
  }, [theme])

  useEffect(() => {
    const element = container.current
    if (!element) return
    // the page has its own zoom buttons, grouped with the other map controls; half
    // steps let a fitted view use the room it has instead of dropping a whole level
    const instance = L.map(element, { zoomControl: false, minZoom: 8, maxZoom: 16, zoomSnap: 0.5 })
    L.tileLayer(mapTiles.url, {
      attribution: mapTiles.attribution,
      subdomains: 'abcd',
      maxNativeZoom: mapTiles.maxNativeZoom,
      className: mapTiles.themed ? 'rc-map__tiles--themed' : undefined,
    }).addTo(instance)
    // the credit of the tiles stays; the library's own prefix is not needed
    instance.attributionControl.setPrefix(false)
    instance.createPane(IMPORTED_PANE).style.zIndex = String(IMPORTED_PANE_Z)
    instance.createPane(PLAN_PANE).style.zIndex = String(PLAN_PANE_Z)
    instance.createPane(PICK_PANE).style.zIndex = String(PICK_PANE_Z)
    const labels = instance.createPane(LABEL_PANE)
    labels.style.zIndex = String(LABEL_PANE_Z)
    labels.style.pointerEvents = 'none'
    canvas.current = L.canvas({ pane: IMPORTED_PANE, padding: 0.5, tolerance: 4 })
    map.current = instance
    overlay.current = L.layerGroup().addTo(instance)
    planLinks.current = L.layerGroup().addTo(instance)
    const importedLayers = drawn.current

    const release = () => {
      framed.current = false
    }
    const zoomGestures = ['wheel', 'dblclick', 'keydown']
    instance.on('dragstart', release)
    for (const type of zoomGestures) element.addEventListener(type, release, { passive: true })

    const showLabels = () => element.classList.toggle('rc-map--labelled', instance.getZoom() >= LABEL_ZOOM)
    instance.on('zoomend', showLabels)

    // a panel opening, the full screen or a turned phone resize the box after
    // Leaflet has measured it: without this a band of the map stays without tiles
    const observer = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
    observer.observe(element)
    const clear = clearArea.current
    const reframe = patientFit(instance, () => {
      if (framed.current) fitPoints(instance, framedPoints.current, clear)
    })
    // after the observer above: Leaflet must know its new size before it fits anything into it
    const unfollow = clear ? followClearArea(instance, clear, reframe) : undefined

    return () => {
      for (const type of zoomGestures) element.removeEventListener(type, release)
      unfollow?.()
      observer.disconnect()
      instance.remove()
      map.current = null
      overlay.current = null
      planLinks.current = null
      canvas.current = null
      pickLayer.current = null
      importedLayers.clear()
      pointed.current = null
    }
  }, [clearArea])

  // The first view is the stations themselves — never an imported layer, which may
  // cover a whole region. The sector's centre only serves a network without stations.
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    instance.setView([center.lat, center.lng], zoom, { animate: false })
    fitPoints(instance, framedPoints.current, clearArea.current, false)
  }, [center.lat, center.lng, zoom, clearArea])

  // Without a network on the map, what is framed arrives later than the map does
  // (the imported stations, then a plan): the view follows it until the user moves
  // the map. A filter never comes through here — it changes neither of the two.
  useEffect(() => {
    const instance = map.current
    if (instance && framed.current) fitPoints(instance, framedPoints.current, clearArea.current, false)
  }, [networkShown, frame, clearArea])

  useEffect(() => {
    const group = overlay.current
    if (!group) return
    group.clearLayers()
    painters.current = []

    const themed: Themed = (layer, style) => {
      const paint = (c: MapColors) => layer.setStyle(style(c))
      paint(colors.current)
      painters.current.push(paint)
      return layer.addTo(group)
    }
    drawNetwork({ group, themed, stations, ties, layers, selectedId, highlightTies, onSelect: (id) => select.current(id) })
  }, [stations, ties, layers, selectedId, highlightTies])

  // Backup plans have a group of their own: a filter or a selection in the network
  // never redraws them, and their colours are the stylesheet's, so neither does a theme.
  useEffect(() => {
    if (planLinks.current) drawPlans(planLinks.current, plans, (id) => selectPlan.current(id))
  }, [plans])

  // Picking: every station of the directory on a canvas of its own, there only while it lasts.
  useEffect(() => {
    const instance = map.current
    if (!instance || !pickable) return
    const layer = drawPickLayer(instance, pickable, (point) => pick.current(point))
    pickLayer.current = layer
    return () => {
      layer.remove()
      pickLayer.current = null
    }
  }, [pickable])

  useEffect(() => {
    pickLayer.current?.hide(pickedBackups)
  }, [pickable, pickedBackups])

  useEffect(() => {
    const { pickable: fill, markerStroke: rim } = themeColors(theme)
    pickLayer.current?.paint({ fill, rim })
  }, [pickable, theme])

  useEffect(() => {
    const instance = map.current
    if (!instance || !pointedOut) return
    const ring = pointOut(pointedOut).addTo(instance)
    return () => {
      ring.remove()
    }
  }, [pointedOut])

  // Imported layers are kept apart from the network overlay: a filter or a
  // selection redraws the stations, never these, and a theme switch only restyles them.
  useEffect(() => {
    const instance = map.current
    const renderer = canvas.current
    if (!instance || !renderer) return
    let changed = false
    for (const [id, { group, features }] of drawn.current) {
      if (imported.some((layer) => layer.id === id && layer.features === features)) continue
      group.remove()
      drawn.current.delete(id)
      changed = true
    }
    for (const { id, features, color } of imported) {
      if (drawn.current.has(id)) continue
      const layer = drawImportedLayer(features, renderer)
      describeOnMap(layer.group, instance)
      drawn.current.set(id, { ...layer, features, color })
      changed = true
    }
    const { markerStroke: rim, importedLabel: label } = themeColors(theme)
    for (const layer of drawn.current.values()) {
      paintImportedLayer(layer, { color: layerColor(layer.color, theme), rim, label })
      // added only once painted, so a layer never flashes in Leaflet's default blue
      layer.group.addTo(instance)
    }
    if (changed) settleStations(drawn.current.values(), renderer)

    // The popup of a place found through the list: it learns its details when
    // its layer arrives, and leaves with the layer.
    const at = pointed.current
    if (!at?.popup.isOpen()) return
    const layer = imported.find(({ id }) => id === at.layerId)
    if (!layer && at.drawn) at.popup.close()
    completeDetail(at, layer?.features)
  }, [imported, theme])

  useEffect(() => {
    const instance = map.current
    if (!instance || !view) return
    if (view.kind === 'fit') {
      framed.current = true
      fitPoints(instance, framedPoints.current, clearArea.current)
      return
    }
    // pointing a place out never takes the map away from the user for good
    if (view.kind === 'reveal') return void panTo(instance, view.at, clearArea.current, true)
    // a framed map moves itself when the panel of the clicked station opens
    if (view.kind === 'station' && view.whenCovered && framed.current) return
    const station = view.kind === 'station' && shown.current.find((s) => s.id === view.id)
    if (view.kind === 'place') {
      const { place, layerId } = view
      if (place.bbox) fitBbox(instance, place.bbox, clearArea.current)
      else flyToPoint(instance, place.at, clearArea.current)
      const popup = openDetail(instance, place.text, [place.at[1], place.at[0]], !place.bbox)
      pointed.current = { layerId, place, popup, drawn: false }
      completeDetail(pointed.current, drawn.current.get(layerId)?.features)
    } else if (view.kind === 'points') fitPoints(instance, view.points, clearArea.current)
    else if (view.kind === 'zoom') instance.setZoom(instance.getZoom() + view.by)
    else if (view.kind === 'bbox') fitBbox(instance, view.bbox, clearArea.current)
    else if (!station || !panTo(instance, station.location, clearArea.current, view.whenCovered)) return
    framed.current = false
  }, [view, clearArea])

  return <div className="rc-map__canvas" ref={container} dir="ltr" role="application" aria-label="خريطة محطات القطاع" />
}
