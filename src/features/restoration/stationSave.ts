import { loadLayerFeatures, saveMapLayer, type LayerUpload, type MapLayer } from '../../services/mapLayers'
import { groupStationChanges, mergeStationFeatures, stationLayerUpload } from './backup/stationLayers'
import type { ReviewedStation } from './backup/stationReview'
import type { CompactFeature } from './import/types'
import { paletteColor } from './layerPalette'

/** Where the layers are kept. The page uses the database; anything with the same two functions will do. */
export interface StationStore {
  load: (sectorId: string, layerId: string) => Promise<CompactFeature[]>
  save: (sectorId: string, layer: LayerUpload) => Promise<string>
}

export const databaseStations: StationStore = { load: loadLayerFeatures, save: saveMapLayer }
const SOURCE = 'Excel'

/**
 * Writes the reviewed stations, layer by layer, through the same path as an
 * imported file: a layer is read whole (its chunks), rewritten with the rows in,
 * and the index updated once per layer. Resolves with the ids of the layers written.
 */
export async function saveStations(sectorId: string, rows: ReviewedStation[], layers: MapLayer[], store: StationStore = databaseStations): Promise<string[]> {
  const written: string[] = []
  const changes = groupStationChanges(rows, layers, sectorId)
  for (const [i, change] of changes.entries()) {
    const existing = change.existing ? await store.load(sectorId, change.existing.id) : []
    const { features, changed } = mergeStationFeatures(existing, change.rows)
    // the same sheet brought again writes nothing
    if (!changed) continue
    written.push(await store.save(sectorId, stationLayerUpload(change, features, paletteColor(layers.length + i), SOURCE)))
  }
  return written
}

export class StationsNotSaved extends Error {
  constructor(cause: unknown) {
    super('stations: not saved, the plans were not written', { cause })
  }
}

export class PlansNotSaved extends Error {
  /** Whether stations went in before the plans failed. */
  stationsWritten: boolean

  constructor(stationsWritten: boolean, cause: unknown) {
    super('plans: not saved', { cause })
    this.stationsWritten = stationsWritten
  }
}

/** The stations first, then the plans that may stand on them; the plans are not tried when the stations fail. */
export async function saveStationsThenPlans(stations: () => Promise<string[]>, plans: () => Promise<void>): Promise<string[]> {
  let written: string[]
  try {
    written = await stations()
  } catch (error) {
    throw new StationsNotSaved(error)
  }
  try {
    await plans()
  } catch (error) {
    throw new PlansNotSaved(written.length > 0, error)
  }
  return written
}
