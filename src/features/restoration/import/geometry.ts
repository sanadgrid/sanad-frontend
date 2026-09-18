import { childrenOf, firstChild, localNameOf, textOf } from './dom'
import type { CompactFeature, Position } from './types'

/** A geometry without the name and description of its placemark. */
export type Shape =
  | { t: 'p'; c: Position }
  | { t: 'l'; c: Position[] }
  | { t: 'g'; c: Position[][] }

// 6 decimals ≈ 0.1 m on the ground, and a third of the digits Google Earth writes
const round = (value: number) => Math.round(value * 1e6) / 1e6

/** `lng,lat[,alt]` tuples separated by whitespace; the altitude is dropped. */
export function parseCoordinates(text: string): Position[] {
  const positions: Position[] = []
  // some exporters write "lng, lat, alt" with spaces inside the tuple
  for (const tuple of text.replace(/\s*,\s*/g, ',').split(/\s+/)) {
    if (!tuple) continue
    const [lng, lat] = tuple.split(',').map(Number)
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue
    const position: Position = [round(lng), round(lat)]
    const previous = positions.at(-1)
    // rounding folds neighbouring vertices together
    if (previous && previous[0] === position[0] && previous[1] === position[1]) continue
    positions.push(position)
  }
  return positions
}

const coordinatesOf = (element: Element) => parseCoordinates(textOf(firstChild(element, 'coordinates')))

function polygonRings(polygon: Element): Position[][] {
  const ringsOf = (boundary: string) =>
    childrenOf(polygon, boundary)
      .flatMap((b) => childrenOf(b, 'LinearRing'))
      .map(coordinatesOf)
      .filter((ring) => ring.length >= 3)
  const [outer] = ringsOf('outerBoundaryIs')
  return outer ? [outer, ...ringsOf('innerBoundaryIs')] : []
}

/** The drawable shapes of one geometry element; a `MultiGeometry` is flattened. */
export function shapesOf(geometry: Element): Shape[] {
  switch (localNameOf(geometry)) {
    case 'Point': {
      const [position] = coordinatesOf(geometry)
      return position ? [{ t: 'p', c: position }] : []
    }
    case 'LineString': {
      const line = coordinatesOf(geometry)
      return line.length >= 2 ? [{ t: 'l', c: line }] : []
    }
    case 'Polygon': {
      const rings = polygonRings(geometry)
      return rings.length > 0 ? [{ t: 'g', c: rings }] : []
    }
    case 'MultiGeometry':
      return childrenOf(geometry).flatMap(shapesOf)
    default:
      // Model, gx:Track … — nothing a flat map layer can show
      return []
  }
}

export function toFeature(shape: Shape, name: string, description: string): CompactFeature {
  return description ? { ...shape, n: name, d: description } : { ...shape, n: name }
}

/** Every position of a feature, whatever its type. */
export function positionsOf(feature: Shape): Position[] {
  if (feature.t === 'p') return [feature.c]
  return feature.t === 'l' ? feature.c : feature.c.flat()
}
