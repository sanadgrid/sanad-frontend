import L from 'leaflet'
import type { StationPoint } from '../backup/directory'
import type { LatLng } from '../types'
import { PLAN_PANE } from './planLinks'

/** Over the network's own markers (400): while stations are being picked, a click means nothing else. */
export const PICK_PANE = 'rc-pick'
export const PICK_PANE_Z = 420

export interface PickColors {
  fill: string
  rim: string
}

export interface PickLayer {
  /** The backups the plan holds, by `pointKey`: their badge sits on their place, so their square goes unseen — and stays clickable. */
  hide: (keys: string[]) => void
  paint: (colors: PickColors) => void
  remove: () => void
}

export const pointKey = (point: { no: string; at: LatLng }) => `${point.no}@${point.at.lng},${point.at.lat}`

const SQUARE: L.CircleMarkerOptions = { radius: 4.75, weight: 1.5, opacity: 1, fillOpacity: 0.95 }
const HOVER_WEIGHT = 3
const CORNER = 2

interface CanvasInternals {
  _ctx: CanvasRenderingContext2D
  _drawing: boolean
  _fillStroke(ctx: CanvasRenderingContext2D, layer: L.Path): void
}

/** The square of an imported station, a little larger: every station of the directory, painted on one canvas. */
class PickSquare extends L.CircleMarker {
  declare _renderer: CanvasInternals
  declare _point: L.Point
  declare _radius: number
  declare _empty: () => boolean

  _updatePath() {
    const { _ctx: ctx, _drawing: drawing } = this._renderer
    if (!drawing || this._empty()) return
    const { x, y } = this._point
    const r = this._radius
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x - r, y - r, r * 2, r * 2, CORNER)
    else ctx.rect(x - r, y - r, r * 2, r * 2)
    this._renderer._fillStroke(ctx, this)
  }
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const tipHtml = (p: StationPoint) =>
  `<div dir="rtl"><bdi dir="ltr" class="num"><b>${escapeHtml(p.no)}</b></bdi>${p.layerName ? ` · <bdi>${escapeHtml(p.layerName)}</bdi>` : ''}</div>`

/**
 * Every station the directory knows, as squares that can be clicked — whatever
 * imported layers are switched on, and without reading anything. A canvas of its
 * own, over the rest of the map, that leaves with the layer.
 */
export function drawPickLayer(map: L.Map, points: StationPoint[], onPick: (point: StationPoint) => void): PickLayer {
  const renderer = L.canvas({ pane: PICK_PANE, padding: 0.5, tolerance: 6 })
  const group = L.featureGroup()
  const pointOf = new WeakMap<L.Layer, StationPoint>()
  const squares = new Map<string, PickSquare>()
  let hidden = new Set<string>()

  for (const point of points) {
    const square = new PickSquare([point.at.lat, point.at.lng], { ...SQUARE, renderer, pane: PICK_PANE, bubblingMouseEvents: false })
    pointOf.set(square, point)
    squares.set(pointKey(point), square)
    group.addLayer(square)
  }

  const tooltip = L.tooltip({ className: 'rc-tooltip', direction: 'top', offset: [0, -8] })
  group
    .on('mouseover', (event: L.LeafletMouseEvent) => {
      const square = event.propagatedFrom as PickSquare
      const point = pointOf.get(square)
      if (!point) return
      if (!hidden.has(pointKey(point))) square.setStyle({ weight: HOVER_WEIGHT })
      map.openTooltip(tooltip.setContent(tipHtml(point)).setLatLng(square.getLatLng()))
    })
    .on('mouseout', (event: L.LeafletMouseEvent) => {
      const square = event.propagatedFrom as PickSquare
      square.setStyle({ weight: SQUARE.weight })
      map.closeTooltip(tooltip)
    })
    .on('click', (event: L.LeafletMouseEvent) => {
      const point = pointOf.get(event.propagatedFrom)
      if (point) onPick(point)
    })

  // picking and unpicking the same square in a row is not a wish to zoom
  const zoomed = map.doubleClickZoom.enabled()
  map.doubleClickZoom.disable()
  group.addTo(map)

  return {
    hide(keys) {
      const next = new Set(keys)
      for (const key of new Set([...hidden, ...next]))
        squares.get(key)?.setStyle(next.has(key) ? { opacity: 0, fillOpacity: 0 } : { opacity: SQUARE.opacity, fillOpacity: SQUARE.fillOpacity })
      hidden = next
    },
    paint({ fill, rim }) {
      group.setStyle({ color: rim, fillColor: fill })
    },
    remove() {
      map.closeTooltip(tooltip)
      group.remove()
      // an empty canvas left over the map would swallow every click meant for the network
      renderer.remove()
      if (zoomed) map.doubleClickZoom.enable()
    },
  }
}

/** A ring that calls the eye to one place: the option of a duplicate number under the pointer. */
export const pointOut = (at: LatLng) =>
  L.marker([at.lat, at.lng], {
    pane: PLAN_PANE,
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: 'rc-plan-marker', iconSize: [0, 0], html: '<span class="rc-pointout"></span>' }),
  })
