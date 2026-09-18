import type { MapLayer } from './mapLayers'

// `mapLayerIndex/{sectorId}` lists the imported layers of a sector in one
// document, so listing them is one read however many there are. No Firebase in here.

export type IndexChange = { upsert: MapLayer } | { remove: string }

export const sortLayers = (layers: MapLayer[]) => [...layers].sort((a, b) => a.name.localeCompare(b.name, 'ar'))

/** The list after the changes, applied in order; a layer imported again replaces its earlier entry. */
export function applyIndexChanges(layers: MapLayer[], changes: IndexChange[]): MapLayer[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  for (const change of changes) {
    if ('upsert' in change) byId.set(change.upsert.id, change.upsert)
    else byId.delete(change.remove)
  }
  return sortLayers([...byId.values()])
}
