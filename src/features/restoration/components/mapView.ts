import L from 'leaflet'
import type { Bbox, Position } from '../import/types'
import type { LatLng } from '../types'

/** Something in an imported layer to bring into view, with what its popup says. */
export interface Place {
  at: Position
  /** What to frame, for a line or an area; a point is flown to. */
  bbox?: Bbox
  text: { n: string; g?: string; d?: string }
  /** Found through the index, which knows the name only: the popup is completed once the layer has arrived. */
  partial?: boolean
}

/** What the page may ask of the map. A new object asks again, even for the same thing. */
export type MapView =
  | { kind: 'fit' }
  | { kind: 'bbox'; bbox: Bbox }
  | { kind: 'zoom'; by: 1 | -1 }
  /** `whenCovered`: only if a panel hides the station — a click on the map itself should not move it. */
  | { kind: 'station'; id: string; whenCovered?: boolean }
  | { kind: 'place'; layerId: string; place: Place }
  /** Frame these places, whatever they are: the stations of a backup plan. */
  | { kind: 'points'; points: LatLng[] }

// kept free around what is fitted, so a marker and its label never touch a panel
const MARGIN = 44
const FIT_MAX_ZOOM = 14
// a clear area smaller than this is not worth aiming at (it is being laid out, or the screen is tiny)
const MIN_CLEAR = 160
// close enough to tell a station from its neighbours and to read its number
const PLACE_ZOOM = 15

interface Padding {
  paddingTopLeft: L.PointTuple
  paddingBottomRight: L.PointTuple
}

/** The panels float over the map: the view is aimed at the part of it that they leave clear. */
function clearPadding(map: L.Map, clear: HTMLElement | null): Padding {
  const box = map.getContainer().getBoundingClientRect()
  const area = clear?.getBoundingClientRect()
  if (!area || area.width < MIN_CLEAR || area.height < MIN_CLEAR)
    return { paddingTopLeft: [MARGIN, MARGIN], paddingBottomRight: [MARGIN, MARGIN] }
  return {
    paddingTopLeft: [Math.max(0, area.left - box.left) + MARGIN, Math.max(0, area.top - box.top) + MARGIN],
    paddingBottomRight: [Math.max(0, box.right - area.right) + MARGIN, Math.max(0, box.bottom - area.bottom) + MARGIN],
  }
}

export function fitPoints(map: L.Map, points: LatLng[], clear: HTMLElement | null, animate = true) {
  if (points.length === 0) return
  const bounds = L.latLngBounds(points.map((p): L.LatLngTuple => [p.lat, p.lng]))
  map.fitBounds(bounds, { ...clearPadding(map, clear), maxZoom: FIT_MAX_ZOOM, animate })
}

export function fitBbox(map: L.Map, [west, south, east, north]: Bbox, clear: HTMLElement | null) {
  map.fitBounds(
    [
      [south, west],
      [north, east],
    ],
    { ...clearPadding(map, clear), maxZoom: 15 },
  )
}

/** Fly to a point so that it lands in the middle of the clear area, close up. */
export function flyToPoint(map: L.Map, [lng, lat]: Position, clear: HTMLElement | null) {
  const { paddingTopLeft: start, paddingBottomRight: end } = clearPadding(map, clear)
  const zoom = Math.max(map.getZoom(), PLACE_ZOOM)
  // the middle of the clear area, measured from the middle of the map
  const shift = L.point((start[0] - end[0]) / 2, (start[1] - end[1]) / 2)
  const centre = map.unproject(map.project([lat, lng], zoom).subtract(shift), zoom)
  map.flyTo(centre, zoom, { duration: 0.8 })
}

/** Bring a station to the middle of the clear area. */
export function panTo(map: L.Map, at: LatLng, clear: HTMLElement | null, whenCovered = false): boolean {
  const { paddingTopLeft: start, paddingBottomRight: end } = clearPadding(map, clear)
  const size = map.getSize()
  const point = map.latLngToContainerPoint([at.lat, at.lng])
  const covered = point.x < start[0] || point.y < start[1] || point.x > size.x - end[0] || point.y > size.y - end[1]
  if (whenCovered && !covered) return false
  map.panBy([point.x - (start[0] + size.x - end[0]) / 2, point.y - (start[1] + size.y - end[1]) / 2])
  return true
}

/**
 * Leaflet drops a view that is asked for in the middle of its zoom animation — two
 * panels opened in a row, a window being resized. The returned function fits at
 * once when it can, and otherwise as soon as the animation ends.
 */
export function patientFit(map: L.Map, fit: () => void): () => void {
  let zooming = false
  let wanted = false
  const run = () => {
    if (!wanted || zooming) return
    wanted = false
    fit()
  }
  map.on('zoomstart', () => {
    zooming = true
  })
  map.on('zoomend', () => {
    zooming = false
    run()
  })
  return () => {
    wanted = true
    run()
  }
}

/**
 * The tile credit must stay readable, so it follows the corner of the clear area
 * instead of sitting under a panel: the stylesheet reads the two distances.
 * `onChange` runs whenever panels or the window give the area another shape.
 */
export function followClearArea(map: L.Map, clear: HTMLElement, onChange: () => void): () => void {
  const container = map.getContainer()
  const place = () => {
    const box = container.getBoundingClientRect()
    const area = clear.getBoundingClientRect()
    container.style.setProperty('--rc-credit-right', `${Math.max(0, box.right - area.right)}px`)
    container.style.setProperty('--rc-credit-bottom', `${Math.max(0, box.bottom - area.bottom)}px`)
    onChange()
  }
  const observer = new ResizeObserver(place)
  observer.observe(clear)
  observer.observe(container)
  place()
  return () => observer.disconnect()
}
