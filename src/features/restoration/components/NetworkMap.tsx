import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, type RefObject } from 'react'
import type { Layers } from '../filters'
import { layerColor } from '../layerPalette'
import { themeColors, type MapColors } from '../mapTheme'
import { mapTiles } from '../mapTiles'
import type { LatLng } from '../types'
import type { VisibleLayer } from '../useMapLayers'
import type { Theme } from '../useTheme'
import { describeOnMap, drawImportedLayer, IMPORTED_PANE, IMPORTED_PANE_Z, paintImportedLayer } from './importedLayer'
import { fitBbox, fitPoints, followClearArea, panTo, patientFit, type MapView } from './mapView'
import { drawNetwork, LABEL_PANE, LABEL_PANE_Z, type MapStation, type MapTie, type Themed } from './networkLayers'

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
  theme: Theme
  onSelect: (stationId: string) => void
}

interface DrawnLayer {
  group: L.FeatureGroup
  /** What the group was built from: a re-import brings a new array, a re-render does not. */
  features: VisibleLayer['features']
  color: string
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
  theme,
  onSelect,
}: NetworkMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const overlay = useRef<L.LayerGroup | null>(null)
  // thousands of imported shapes are painted on one canvas instead of one SVG node each
  const canvas = useRef<L.Renderer | null>(null)
  const drawn = useRef(new Map<string, DrawnLayer>())
  // the latest values, for handlers and for views asked long after the markers were drawn
  const select = useRef(onSelect)
  const shown = useRef(stations)
  useEffect(() => {
    select.current = onSelect
    shown.current = stations
  }, [onSelect, stations])

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
    const labels = instance.createPane(LABEL_PANE)
    labels.style.zIndex = String(LABEL_PANE_Z)
    labels.style.pointerEvents = 'none'
    canvas.current = L.canvas({ pane: IMPORTED_PANE, padding: 0.5, tolerance: 4 })
    map.current = instance
    overlay.current = L.layerGroup().addTo(instance)
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
      if (framed.current) fitPoints(instance, shown.current.map((s) => s.location), clear)
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
      canvas.current = null
      importedLayers.clear()
    }
  }, [clearArea])

  // The first view is the stations themselves — never an imported layer, which may
  // cover a whole region. The sector's centre only serves a network without stations.
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    instance.setView([center.lat, center.lng], zoom, { animate: false })
    fitPoints(
      instance,
      shown.current.map((s) => s.location),
      clearArea.current,
      false,
    )
  }, [center.lat, center.lng, zoom, clearArea])

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
    drawNetwork({ group, themed, stations, ties, layers, selectedId, onSelect: (id) => select.current(id) })
  }, [stations, ties, layers, selectedId])

  // Imported layers are kept apart from the network overlay: a filter or a
  // selection redraws the stations, never these, and a theme switch only restyles them.
  useEffect(() => {
    const instance = map.current
    const renderer = canvas.current
    if (!instance || !renderer) return
    for (const [id, { group, features }] of drawn.current) {
      if (imported.some((layer) => layer.id === id && layer.features === features)) continue
      group.remove()
      drawn.current.delete(id)
    }
    for (const { id, features, color } of imported) {
      if (drawn.current.has(id)) continue
      const group = drawImportedLayer(features, renderer)
      describeOnMap(group, instance)
      drawn.current.set(id, { group, features, color })
    }
    const rim = themeColors(theme).markerStroke
    for (const { group, color } of drawn.current.values()) {
      paintImportedLayer(group, { color: layerColor(color, theme), rim })
      // added only once painted, so a layer never flashes in Leaflet's default blue
      group.addTo(instance)
    }
  }, [imported, theme])

  useEffect(() => {
    const instance = map.current
    if (!instance || !view) return
    if (view.kind === 'fit') {
      framed.current = true
      fitPoints(
        instance,
        shown.current.map((s) => s.location),
        clearArea.current,
      )
      return
    }
    // a framed map moves itself when the panel of the clicked station opens
    if (view.kind === 'station' && view.whenCovered && framed.current) return
    const station = view.kind === 'station' && shown.current.find((s) => s.id === view.id)
    if (view.kind === 'zoom') instance.setZoom(instance.getZoom() + view.by)
    else if (view.kind === 'bbox') fitBbox(instance, view.bbox, clearArea.current)
    else if (!station || !panTo(instance, station.location, clearArea.current, view.whenCovered)) return
    framed.current = false
  }, [view, clearArea])

  return <div className="rc-map__canvas" ref={container} dir="ltr" role="application" aria-label="خريطة محطات القطاع" />
}
