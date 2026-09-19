import L from 'leaflet'
import type { StationPoint } from '../backup/directory'
import { IMPORTED_PANE, StationMarker } from './importedLayer'
import { popupContent, type StationActions } from './stationPopup'

/** Closer than the stations of a ticked layer show theirs: these are every station of the sector at once. */
export const BASE_LABEL_ZOOM = 14

export interface BaseColors {
  fill: string
  rim: string
  label: string
}

export interface BaseStationLayer {
  paint: (colors: BaseColors) => void
  /** Once painted, so the squares never flash in the library's own blue. */
  addTo: (map: L.Map) => void
  /** Over the lines and areas of the imported layers, so a square can always be clicked. */
  toFront: () => void
  remove: () => void
}

// quiet: smaller and paler than the square of a ticked layer, which says "look here"
const SQUARE: L.CircleMarkerOptions = { radius: 3.25, weight: 1, opacity: 0.9, fillOpacity: 0.85 }
const HOVER_WEIGHT = 2.5

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const numberHtml = (p: StationPoint) => `<bdi dir="ltr" class="num"><b>${escapeHtml(p.no)}</b></bdi>`
const tipHtml = (p: StationPoint) => `<div dir="rtl">${numberHtml(p)}${p.layerName ? ` · <bdi>${escapeHtml(p.layerName)}</bdi>` : ''}</div>`
const detailHtml = (p: StationPoint) =>
  `<div dir="rtl">${numberHtml(p)}${p.name !== `S/S ${p.no}` ? ` · <bdi>${escapeHtml(p.name)}</bdi>` : ''}` +
  `${p.layerName ? `<span class="rc-popup__group">${escapeHtml(p.layerName)}</span>` : ''}</div>`

/**
 * Every station of the sector as a small square, on the canvas the imported
 * layers share — they are there whatever is ticked, and whatever happens to the
 * plans. The page already holds their places: drawing them reads nothing.
 */
export function drawBaseStations(map: L.Map, renderer: L.Renderer, points: StationPoint[], actionsOf: StationActions): BaseStationLayer {
  const group = L.featureGroup()
  const pointOf = new WeakMap<L.Layer, StationPoint>()
  for (const point of points) {
    const square = new StationMarker([point.at.lat, point.at.lng], { ...SQUARE, renderer, pane: IMPORTED_PANE, bubblingMouseEvents: false }, point.no, BASE_LABEL_ZOOM)
    square.corner = 1
    pointOf.set(square, point)
    group.addLayer(square)
  }

  const tooltip = L.tooltip({ className: 'rc-tooltip', direction: 'top', offset: [0, -6] })
  group
    .on('mouseover', (event: L.LeafletMouseEvent) => {
      const square = event.propagatedFrom as StationMarker
      const point = pointOf.get(square)
      if (!point) return
      square.setStyle({ weight: HOVER_WEIGHT })
      map.openTooltip(tooltip.setContent(tipHtml(point)).setLatLng(square.getLatLng()))
    })
    .on('mouseout', (event: L.LeafletMouseEvent) => {
      ;(event.propagatedFrom as StationMarker).setStyle({ weight: SQUARE.weight })
      map.closeTooltip(tooltip)
    })
    .on('click', (event: L.LeafletMouseEvent) => {
      const point = pointOf.get(event.propagatedFrom)
      if (!point) return
      map.closeTooltip(tooltip)
      const popup = L.popup({ className: 'rc-popup', maxWidth: 300, offset: [0, -3] }).setLatLng([point.at.lat, point.at.lng])
      popup.setContent(popupContent(detailHtml(point), actionsOf(point), () => popup.close())).openOn(map)
    })

  return {
    paint({ fill, rim, label }) {
      group.eachLayer((layer) => Object.assign(layer, { labelColor: label, haloColor: rim }))
      group.setStyle({ color: rim, fillColor: fill })
    },
    addTo(target) {
      group.addTo(target)
    },
    toFront() {
      group.eachLayer((layer) => (layer as StationMarker).bringToFront())
    },
    remove() {
      map.closeTooltip(tooltip)
      group.remove()
    },
  }
}
