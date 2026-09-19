import type { CompactFeature, Position } from './types'

// A point is a station when its name opens with a four-digit station number,
// with or without the usual prefix: "S/S 7001", "S/S_8123", "ss-9001", "7001".
// A fifth digit or a letter right after the number means it is something else.
const STATION_NAME = /^\s*(?:S\/S|SS|S\.S\.?)?[\s_-]*([1-9]\d{3})(?![0-9A-Za-z])/i

/** One station of a layer as the index lists it — enough to find it without reading the layer. */
export interface StationEntry {
  no: string
  /** The name in the file; left out when it is the usual `S/S ${no}`. */
  n?: string
  c: Position
}

export interface StationHit {
  layerId: string
  layerName: string
  station: StationEntry
}

interface ListedLayer {
  id: string
  name: string
  stations?: StationEntry[]
}

/** The station number a name starts with, or `null` when the name is not a station's. */
export const stationNoOf = (name: string): string | null => STATION_NAME.exec(name)?.[1] ?? null

const usualName = (no: string) => `S/S ${no}`

export const stationNameOf = (station: StationEntry) => station.n ?? usualName(station.no)

/** The station points of a layer, by number. */
export function stationDirectory(features: CompactFeature[]): StationEntry[] {
  const seen = new Set<string>()
  const stations: StationEntry[] = []
  for (const feature of features) {
    if (feature.t !== 'p') continue
    const no = stationNoOf(feature.n)
    if (!no) continue
    // the same placemark pasted twice in the file is one station
    const key = `${feature.n}|${feature.c.join()}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = feature.n.trim()
    stations.push(name === usualName(no) ? { no, c: feature.c } : { no, n: name, c: feature.c })
  }
  return stations.sort((a, b) => a.no.localeCompare(b.no) || stationNameOf(a).localeCompare(stationNameOf(b)))
}

const ARABIC_ZERO = 0x0660
const PERSIAN_ZERO = 0x06f0

/** Lower case, and digits typed on an Arabic keyboard read as Latin ones. */
export const normalizeQuery = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - ARABIC_ZERO))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - PERSIAN_ZERO))

/**
 * Stations whose number or name matches, numbers that start with the query
 * first. Works on what the index lists, so searching reads nothing.
 */
export function searchStations(layers: ListedLayer[], query: string, limit: number): { hits: StationHit[]; total: number } {
  const q = normalizeQuery(query)
  if (!q) return { hits: [], total: 0 }
  // "s/s 70" and "70" look for the same stations
  const digits = q.replace(/\D/g, '')
  const ranked: { hit: StationHit; rank: number }[] = []
  for (const layer of layers) {
    for (const station of layer.stations ?? []) {
      const at = digits ? station.no.indexOf(digits) : -1
      const named = stationNameOf(station).toLowerCase().includes(q)
      if (at < 0 && !named) continue
      ranked.push({ hit: { layerId: layer.id, layerName: layer.name, station }, rank: at === 0 ? 0 : 1 })
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || a.hit.station.no.localeCompare(b.hit.station.no))
  return { hits: ranked.slice(0, limit).map((r) => r.hit), total: ranked.length }
}
