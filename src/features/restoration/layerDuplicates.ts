import type { Bbox, LayerCounts } from './import/types'

// A source file that holds the same folder twice is imported as twin layers
// ("Zone", "Zone (2)"). Twins are told from what the index already lists about a
// layer — finding them reads nothing. Pure: no Firebase in here.

interface ListedLayer {
  id: string
  sectorId: string
  name: string
  importedAt: number | null
  counts: LayerCounts
  bbox: Bbox
  stations?: unknown[]
}

export interface DuplicateGroup<T extends ListedLayer> {
  /** The earliest import: the one that stays. */
  keep: T
  /** Its twins, to be deleted. */
  remove: T[]
}

// "Zone (2)" is what an importer calls the second folder named "Zone"
const COPY_SUFFIX = /\s*\(\d+\)$/

const hasSuffix = (name: string) => COPY_SUFFIX.test(name.trim())
const baseName = (name: string) => name.trim().replace(COPY_SUFFIX, '').trim().toLowerCase()

/**
 * Same name is not enough — two districts may share one. A twin also has the
 * same counts, the same extent (to about a metre) and as many stations.
 */
const fingerprint = (layer: ListedLayer) =>
  JSON.stringify([
    layer.sectorId,
    baseName(layer.name),
    layer.counts.point,
    layer.counts.line,
    layer.counts.polygon,
    layer.bbox.map((value) => value.toFixed(5)),
    layer.stations?.length ?? 0,
  ])

const never = Number.POSITIVE_INFINITY

/** The earliest import first; of two made at the same moment, the one that kept the plain name. */
const byAge = (a: ListedLayer, b: ListedLayer) =>
  (a.importedAt ?? never) - (b.importedAt ?? never) || Number(hasSuffix(a.name)) - Number(hasSuffix(b.name)) || a.id.localeCompare(b.id)

export function findDuplicateLayers<T extends ListedLayer>(layers: T[]): DuplicateGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const layer of layers) {
    const key = fingerprint(layer)
    groups.set(key, [...(groups.get(key) ?? []), layer])
  }
  return [...groups.values()]
    .filter((twins) => twins.length > 1)
    .map((twins) => {
      const [keep, ...remove] = [...twins].sort(byAge)
      return { keep, remove }
    })
}
