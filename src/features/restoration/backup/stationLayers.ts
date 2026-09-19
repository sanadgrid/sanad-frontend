import { stationNoOf, usualName } from '../import/stations'
import type { Bbox, CompactFeature, LayerCounts } from '../import/types'
import { distanceKm } from './directory'
import { SAME_PLACE_KM, stationLayerId, stationLayerName, stationLayerPath, type ReviewedStation } from './stationReview'

// Stations that passed review, as the layers they are written into: the ones
// typed by hand go into a layer of their own (or the one the sheet names), a
// FLOCSAP for a known station goes into the layer that lists it. A layer is
// written whole, so its features are the old ones with the changes in. Pure.

export interface StationLayerUpload {
  name: string
  path: string
  sourceFile: string
  counts: LayerCounts
  bbox: Bbox
  color: string
  features: CompactFeature[]
}

interface ListedLayer {
  id: string
  name: string
  path: string
  sourceFile: string
  style: { color: string }
}

export interface StationLayerChange<T extends ListedLayer> {
  id: string
  name: string
  path: string
  /** The layer as listed, when it exists already. */
  existing: T | null
  rows: ReviewedStation[]
}

/** The point a sheet's row becomes: named by its number, the given name kept with it. */
export function stationFeature(r: ReviewedStation): CompactFeature {
  const { no, name, floc } = r.row
  const at = r.at ?? { lat: 0, lng: 0 }
  const n = !name ? usualName(no) : stationNoOf(name) === no ? name : `${usualName(no)} ${name}`
  return { t: 'p', n, c: [at.lng, at.lat], ...(name && name !== n && { d: name }), ...(floc && { f: floc }) }
}

const isStationAt = (feature: CompactFeature, no: string, at: { lat: number; lng: number }) =>
  feature.t === 'p' && stationNoOf(feature.n) === no && distanceKm({ lat: feature.c[1], lng: feature.c[0] }, at) <= SAME_PLACE_KM

/** The layer's features with the rows in: a station already at its place only takes the FLOCSAP; the rest are added. */
export function mergeStationFeatures(existing: CompactFeature[], rows: ReviewedStation[]): { features: CompactFeature[]; changed: boolean } {
  const features = [...existing]
  let changed = false
  for (const r of rows) {
    if (!r.at) continue
    const at = r.at
    const index = features.findIndex((f) => isStationAt(f, r.row.no, at))
    if (index < 0) {
      features.push(stationFeature(r))
      changed = true
    } else if (r.row.floc && features[index].f !== r.row.floc) {
      // an empty cell never erases a FLOCSAP; a given one replaces it
      features[index] = { ...features[index], f: r.row.floc }
      changed = true
    }
  }
  return { features, changed }
}

/** The layers the rows go to: FLOCSAP updates to the layer that lists the station, the others by the layer name they give. */
export function groupStationChanges<T extends ListedLayer>(rows: ReviewedStation[], layers: T[], sectorId: string): StationLayerChange<T>[] {
  const changes = new Map<string, StationLayerChange<T>>()
  const listed = new Map(layers.map((layer) => [layer.id, layer]))
  for (const r of rows) {
    const known = r.state === 'flocUpdate' && r.point ? listed.get(r.point.layerId) : undefined
    const name = known?.name ?? stationLayerName(r.row)
    const id = known?.id ?? stationLayerId(sectorId, r.row)
    const change = changes.get(id) ?? { id, name, path: known?.path ?? stationLayerPath(name), existing: known ?? listed.get(id) ?? null, rows: [] }
    change.rows.push(r)
    changes.set(id, change)
  }
  return [...changes.values()]
}

function bboxOf(features: CompactFeature[]): Bbox {
  const points = features.flatMap((f) => (f.t === 'p' ? [f.c] : f.t === 'l' ? f.c : f.c.flat()))
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const countsOf = (features: CompactFeature[]): LayerCounts => ({
  point: features.filter((f) => f.t === 'p').length,
  line: features.filter((f) => f.t === 'l').length,
  polygon: features.filter((f) => f.t === 'g').length,
})

/** What is written for a changed layer: every feature, described afresh. */
export const stationLayerUpload = <T extends ListedLayer>(change: StationLayerChange<T>, features: CompactFeature[], color: string, sourceFile: string): StationLayerUpload => ({
  name: change.name,
  path: change.path,
  sourceFile: change.existing?.sourceFile || sourceFile,
  counts: countsOf(features),
  bbox: bboxOf(features),
  color: change.existing?.style.color ?? color,
  features,
})
