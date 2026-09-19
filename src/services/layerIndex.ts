import type { StationEntry } from '../features/restoration/import/stations'
import type { MapLayer } from './mapLayers'

// `mapLayerIndex/{sectorId}` lists the imported layers of a sector in one
// document, so listing them is one read however many there are. Each layer also
// lists its stations there, so finding a station reads nothing. No Firebase in here.

export type IndexChange =
  | { upsert: MapLayer }
  /** Gone for good: its parts have been deleted. */
  | { remove: string }
  /** Hidden everywhere and kept for thirty days: nothing of the layer itself is touched. */
  | { trash: string[]; at: number; by?: string }
  | { restore: string[] }
  /** Station lists worked out for layers imported before the index carried them, by layer id. */
  | { stations: Record<string, StationEntry[]> }

// a stored document may not exceed 1 MiB; the list is measured as JSON, which runs larger than what is stored
export const MAX_INDEX_BYTES = 800_000
export const LAYER_TRASH_DAYS = 30
const LAYER_TRASH_MS = LAYER_TRASH_DAYS * 24 * 60 * 60_000

/** The layers the page shows, searches and counts: a deleted one is none of them. */
export const liveLayers = (layers: MapLayer[]) => layers.filter((layer) => !layer.deletedAt)
/** Deleted and still restorable, the latest first. */
export const trashedLayers = (layers: MapLayer[]) => layers.filter((layer) => layer.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
/** Deleted more than thirty days ago: what an admin's next visit clears for good. */
export const expiredLayers = (layers: MapLayer[], now: number) => layers.filter((layer) => layer.deletedAt && now - layer.deletedAt >= LAYER_TRASH_MS)

export const sortLayers = (layers: MapLayer[]) => [...layers].sort((a, b) => a.name.localeCompare(b.name, 'ar'))

/** The list after the changes, applied in order; a layer imported again replaces its earlier entry. */
export function applyIndexChanges(layers: MapLayer[], changes: IndexChange[]): MapLayer[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  for (const change of changes) {
    if ('upsert' in change) byId.set(change.upsert.id, change.upsert)
    else if ('remove' in change) byId.delete(change.remove)
    else if ('trash' in change) {
      for (const id of change.trash) {
        const layer = byId.get(id)
        if (layer && !layer.deletedAt) byId.set(id, { ...layer, deletedAt: change.at, ...(change.by && { deletedBy: change.by }) })
      }
    } else if ('restore' in change) {
      for (const id of change.restore) {
        const layer = byId.get(id)
        if (!layer) continue
        const { deletedAt: _at, deletedBy: _by, ...live } = layer
        byId.set(id, live)
      }
    } else
      for (const [id, stations] of Object.entries(change.stations)) {
        const layer = byId.get(id)
        // a layer deleted meanwhile stays deleted, and one imported again already lists its own
        if (layer && !layer.stations) byId.set(id, { ...layer, stations })
      }
  }
  return sortLayers([...byId.values()])
}

const bytesOf = (layers: MapLayer[]) => new TextEncoder().encode(JSON.stringify(layers)).length

/**
 * The list within what one document can hold. A few hundred stations are far
 * below the limit; should a sector ever outgrow it, the station names go first
 * (the numbers still find them), then the longest station lists.
 */
export function fitIndex(layers: MapLayer[], maxBytes = MAX_INDEX_BYTES): MapLayer[] {
  if (bytesOf(layers) <= maxBytes) return layers
  let fitted = layers.map((layer) => ({ ...layer, stations: layer.stations?.map(({ no, c }) => ({ no, c })) }))
  while (bytesOf(fitted) > maxBytes) {
    const longest = fitted.reduce((a, b) => ((b.stations?.length ?? 0) > (a.stations?.length ?? 0) ? b : a))
    if (!longest.stations?.length) break
    fitted = fitted.map((layer) => (layer === longest ? { ...layer, stations: [] } : layer))
  }
  return fitted
}
