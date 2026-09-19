import L from 'leaflet'
import { continuesLine } from '../import/contents'
import { stationNoOf } from '../import/stations'
import type { CompactFeature, Position } from '../import/types'
import { popupContent, type StationActions } from './stationPopup'

/** Below Leaflet's overlay pane (400), where the ties and stations are drawn. */
export const IMPORTED_PANE = 'rc-imported'
export const IMPORTED_PANE_Z = 350
/** From this zoom a station of an imported layer shows its number. */
export const STATION_LABEL_ZOOM = 13

export interface ImportedStyle {
  color: string
  /** The rim that lifts a point off the basemap, and the halo around a station's number. */
  rim: string
  /** The colour of a station's number. */
  label: string
}

/** A layer as drawn; its stations are also listed apart, to be kept over everything else imported. */
export interface DrawnImportedLayer {
  group: L.FeatureGroup
  stations: L.CircleMarker[]
}

type FeatureText = Pick<CompactFeature, 'n' | 'g' | 'd'>

// Context, not content: a layer can hold thousands of shapes, and they must stay
// behind the few stations the page is about — small, thin and partly transparent.
const POINT: L.CircleMarkerOptions = { radius: 2.5, weight: 0.6, opacity: 0.5, fillOpacity: 0.55 }
const AREA: L.PolylineOptions = { weight: 1, opacity: 0.6, fillOpacity: 0.06 }
const LINE: L.PolylineOptions = { weight: 1.2, opacity: 0.55 }
// The stations are what people look for in a layer: a solid square, about 9px with its rim.
const STATION: L.CircleMarkerOptions = { radius: 3.75, weight: 1.5, opacity: 1, fillOpacity: 1 }
const STATION_CORNER = 2
const LABEL_FONT = '600 10.5px'
const LABEL_GAP = 4
// room for four digits, so a redraw of part of the canvas never cuts a number in half
const LABEL_REACH = 40
const LABEL_HALF_HEIGHT = 8
// what a number and a square keep to themselves when numbers are handed out
const LABEL_BOX = { from: 5, to: 38, half: 7 }
const SQUARE_BOX = 6
const CELL = 48

// the parts of Leaflet's canvas drawing that a custom shape has to reach into
interface CanvasInternals {
  _ctx: CanvasRenderingContext2D
  _drawing: boolean
  _fillStroke(ctx: CanvasRenderingContext2D, layer: L.Path): void
}
const circleInternals = L.CircleMarker.prototype as unknown as { _updateBounds(this: L.CircleMarker): void }
const fontFamilies = new WeakMap<L.Map, string>()

function fontFamilyOf(map: L.Map): string {
  let family = fontFamilies.get(map)
  if (!family) {
    family = getComputedStyle(map.getContainer()).fontFamily || 'sans-serif'
    fontFamilies.set(map, family)
  }
  return family
}

type Box = [left: number, top: number, right: number, bottom: number]

/**
 * Which stations show their number at the current zoom. Where stations crowd,
 * numbers would pile into an unreadable smear: a number is only given where it
 * covers no other station and no number already given. Zooming in frees room,
 * so every station gets its number eventually. Worked out once per zoom.
 */
class NumberPlan {
  readonly stations = new Set<StationMarker>()
  private zoom: number | null = null
  private numbered = new Set<StationMarker>()

  changed() {
    this.zoom = null
  }

  shows(station: StationMarker, map: L.Map): boolean {
    const zoom = map.getZoom()
    if (zoom < station.labelZoom) return false
    if (zoom !== this.zoom) this.work(map, zoom)
    return this.numbered.has(station)
  }

  private work(map: L.Map, zoom: number) {
    const cells = new Map<string, Box[]>()
    const cellsOf = ([left, top, right, bottom]: Box) => {
      const keys: string[] = []
      for (let x = Math.floor(left / CELL); x <= Math.floor(right / CELL); x += 1)
        for (let y = Math.floor(top / CELL); y <= Math.floor(bottom / CELL); y += 1) keys.push(`${x}:${y}`)
      return keys
    }
    const take = (box: Box) => {
      for (const key of cellsOf(box)) {
        const boxes = cells.get(key)
        if (boxes) boxes.push(box)
        else cells.set(key, [box])
      }
    }
    const free = (box: Box, own: Box) =>
      cellsOf(box).every((key) =>
        (cells.get(key) ?? []).every((o) => o === own || o[0] > box[2] || o[2] < box[0] || o[1] > box[3] || o[3] < box[1]),
      )

    const placed = [...this.stations].map((station) => {
      const { x, y } = map.project(station.getLatLng(), zoom)
      const square: Box = [x - SQUARE_BOX, y - SQUARE_BOX, x + SQUARE_BOX, y + SQUARE_BOX]
      take(square)
      return { station, square, label: [x + LABEL_BOX.from, y - LABEL_BOX.half, x + LABEL_BOX.to, y + LABEL_BOX.half] as Box }
    })
    this.numbered = new Set()
    for (const { station, square, label } of placed) {
      // every square is in the way of a number, but only a station close enough to show its own asks for one
      if (zoom < station.labelZoom || !free(label, square)) continue
      take(label)
      this.numbered.add(station)
    }
    this.zoom = zoom
  }
}

const plans = new WeakMap<L.Map, NumberPlan>()

function planOf(map: L.Map): NumberPlan {
  let plan = plans.get(map)
  if (!plan) plans.set(map, (plan = new NumberPlan()))
  return plan
}

/**
 * A rounded square with the station's number beside it, painted on the shared
 * canvas: hundreds of them cost no DOM nodes, and the numbers only appear once
 * the map is close enough for them not to pile up.
 */
export class StationMarker extends L.CircleMarker {
  declare _renderer: CanvasInternals
  declare _map: L.Map
  declare _point: L.Point
  declare _radius: number
  declare _pxBounds: L.Bounds
  declare _empty: () => boolean
  no: string
  /** From this zoom the number is shown, where there is room for it. */
  labelZoom: number
  /** How rounded the square is: a smaller one keeps sharper corners, or it would read as a dot. */
  corner = STATION_CORNER
  labelColor = '#000'
  haloColor = '#fff'

  constructor(at: L.LatLngTuple, options: L.CircleMarkerOptions, no: string, labelZoom = STATION_LABEL_ZOOM) {
    super(at, options)
    this.no = no
    this.labelZoom = labelZoom
  }

  onAdd(map: L.Map) {
    const plan = planOf(map)
    plan.stations.add(this)
    plan.changed()
    return super.onAdd(map)
  }

  onRemove(map: L.Map) {
    const plan = planOf(map)
    plan.stations.delete(this)
    plan.changed()
    return super.onRemove(map)
  }

  _updateBounds() {
    circleInternals._updateBounds.call(this)
    // whether or not this station is given a number: the plan is only worked out when the canvas is drawn
    if (this._map.getZoom() < this.labelZoom) return
    const { x, y } = this._point
    this._pxBounds.extend([x + LABEL_REACH, y - LABEL_HALF_HEIGHT]).extend([x + LABEL_REACH, y + LABEL_HALF_HEIGHT])
  }

  _updatePath() {
    const { _ctx: ctx, _drawing: drawing } = this._renderer
    if (!drawing || this._empty()) return
    const { x, y } = this._point
    const r = this._radius
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x - r, y - r, r * 2, r * 2, this.corner)
    else ctx.rect(x - r, y - r, r * 2, r * 2)
    this._renderer._fillStroke(ctx, this)
    if (!planOf(this._map).shows(this, this._map)) return
    ctx.globalAlpha = 1
    ctx.font = `${LABEL_FONT} ${fontFamilyOf(this._map)}`
    ctx.direction = 'ltr'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = this.haloColor
    ctx.strokeText(this.no, x + r + LABEL_GAP, y + 0.5)
    ctx.fillStyle = this.labelColor
    ctx.fillText(this.no, x + r + LABEL_GAP, y + 0.5)
  }
}

// what a drawn shape says when it is hovered or clicked
const info = new WeakMap<L.Layer, CompactFeature>()

// names and descriptions come from a file: they are never trusted as markup
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const flip = ([lng, lat]: Position): L.LatLngTuple => [lat, lng]

const nameHtml = (f: FeatureText) => `<div dir="auto">${escapeHtml(f.n || f.g || '')}</div>`
const detailHtml = (f: FeatureText) =>
  `<div dir="auto">${f.n ? `<b>${escapeHtml(f.n)}</b>` : ''}` +
  `${f.g ? `<span class="rc-popup__group">${escapeHtml(f.g)}</span>` : ''}` +
  `${f.d ? `<p>${escapeHtml(f.d)}</p>` : ''}</div>`

/**
 * One Leaflet layer per feature, except lines: a drawing converted from CAD is
 * thousands of short segments under one name, and those become a single
 * multi-line — one object to draw and to hit-test instead of thousands.
 */
export function drawImportedLayer(features: CompactFeature[], renderer: L.Renderer): DrawnImportedLayer {
  const shared = { renderer, pane: IMPORTED_PANE }
  const group = L.featureGroup()
  const stations: L.CircleMarker[] = []
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i]
    let shape: L.Path
    if (feature.t === 'p') {
      const no = stationNoOf(feature.n)
      if (no) stations.push((shape = new StationMarker(flip(feature.c), { ...shared, ...STATION }, no)))
      else shape = L.circleMarker(flip(feature.c), { ...shared, ...POINT })
    } else if (feature.t === 'g') shape = L.polygon(feature.c.map((ring) => ring.map(flip)), { ...shared, ...AREA })
    else {
      const lines = [feature.c.map(flip)]
      for (let next = features[i + 1]; next?.t === 'l' && continuesLine(feature, next); next = features[i + 1]) {
        lines.push(next.c.map(flip))
        i += 1
      }
      shape = L.polyline(lines, { ...shared, ...LINE })
    }
    info.set(shape, feature)
    group.addLayer(shape)
  }
  return { group, stations }
}

export function paintImportedLayer({ group }: DrawnImportedLayer, { color, rim, label }: ImportedStyle) {
  group.eachLayer((layer) => {
    if (layer instanceof StationMarker) Object.assign(layer, { labelColor: label, haloColor: rim })
    if (layer instanceof L.CircleMarker) layer.setStyle({ color: rim, fillColor: color })
    else if (layer instanceof L.Path) layer.setStyle({ color, fillColor: color })
  })
}

/**
 * After layers came or went: the stations go over every other imported shape,
 * whichever layer was ticked last, and the whole canvas is painted again — the
 * numbers are shared out between all the stations on the map.
 */
export function settleStations(layers: Iterable<DrawnImportedLayer>, renderer: L.Renderer) {
  for (const { stations } of layers) for (const station of stations) station.bringToFront()
  // the canvas repaints everything when its own "update" is announced
  renderer.fire('update')
}

/** What can be done with the place, when it is a station: the page decides, the popup offers it. */
function actionsFor(text: FeatureText, at: L.LatLngTuple | null, actionsOf: StationActions | undefined) {
  const no = at && stationNoOf(text.n)
  return no && actionsOf ? actionsOf({ no, at: { lat: at[0], lng: at[1] } }) : []
}

// Leaflet sinks a popup's tip into its anchor, which suits a pin; over a small square it would hide the square
const OVER_A_POINT: L.PointTuple = [0, -3]

/** The popup of a place picked in the list. It never moves the map: whoever opens it is already on the way there. */
export function openDetail(map: L.Map, text: FeatureText, at: L.LatLngTuple, onPoint: boolean, actionsOf?: StationActions): L.Popup {
  const popup = L.popup({ className: 'rc-popup', maxWidth: 300, maxHeight: 240, autoPan: false, ...(onPoint && { offset: OVER_A_POINT }) }).setLatLng(at)
  return setDetail(popup, text, onPoint ? at : null, actionsOf).openOn(map)
}

export const setDetail = (popup: L.Popup, text: FeatureText, at: L.LatLngTuple | null, actionsOf?: StationActions) =>
  popup.setContent(popupContent(detailHtml(text), actionsFor(text, at, actionsOf), () => popup.close()))

/** A name on hover and the details on click, with one tooltip for the whole layer. */
export function describeOnMap(group: L.FeatureGroup, map: L.Map, actionsOf?: StationActions) {
  const tooltip = L.tooltip({ className: 'rc-tooltip', direction: 'top', offset: [0, -6] })
  group
    .on('mouseover', (event: L.LeafletMouseEvent) => {
      const feature = info.get(event.propagatedFrom)
      if (feature?.n || feature?.g) map.openTooltip(tooltip.setContent(nameHtml(feature)).setLatLng(event.latlng))
    })
    .on('mousemove', (event: L.LeafletMouseEvent) => tooltip.setLatLng(event.latlng))
    .on('mouseout remove', () => map.closeTooltip(tooltip))
    .on('click', (event: L.LeafletMouseEvent) => {
      const feature = info.get(event.propagatedFrom)
      if (!feature || (!feature.n && !feature.g && !feature.d)) return
      const popup = L.popup({ className: 'rc-popup', maxWidth: 300, maxHeight: 240 }).setLatLng(event.latlng)
      setDetail(popup, feature, feature.t === 'p' ? flip(feature.c) : null, actionsOf).openOn(map)
    })
}
