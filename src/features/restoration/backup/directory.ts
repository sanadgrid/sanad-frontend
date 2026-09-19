import { normalizeQuery, stationNameOf, stationNoOf, type StationEntry } from '../import/stations'
import type { LatLng } from '../types'

// Where a station of a backup plan stands on the map. The plan stores numbers
// only; the places come from the station lists of the imported layers, which the
// page already holds — looking one up reads nothing.

export interface DirectoryStation {
  no: string
  name: string
  at: LatLng
  /** Every layer that lists the station: selecting a plan switches them on. */
  layerIds: string[]
}

export type StationDirectory = ReadonlyMap<string, DirectoryStation>

interface ListedLayer {
  id: string
  stations?: StationEntry[]
}

export function buildDirectory(layers: ListedLayer[]): StationDirectory {
  const directory = new Map<string, DirectoryStation>()
  for (const layer of layers)
    for (const station of layer.stations ?? []) {
      const known = directory.get(station.no)
      // listed by several layers: the first place stands, and every layer is remembered
      if (known) known.layerIds.push(layer.id)
      else directory.set(station.no, { no: station.no, name: stationNameOf(station), at: { lat: station.c[1], lng: station.c[0] }, layerIds: [layer.id] })
    }
  return directory
}

/** A plan may name a feeder ("7001/F3"): it stands where its station does. */
export const locate = (directory: StationDirectory, no: string) =>
  directory.get(stationNoOf(normalizeQuery(no)) ?? normalizeQuery(no)) ?? null

/** Numbers that start with what was typed, then those that contain it. */
export function suggest(directory: StationDirectory, typed: string, limit: number): DirectoryStation[] {
  const digits = normalizeQuery(typed).replace(/\D/g, '')
  if (!digits) return []
  const starts: DirectoryStation[] = []
  const contains: DirectoryStation[] = []
  for (const station of directory.values()) {
    const at = station.no.indexOf(digits)
    if (at === 0) starts.push(station)
    else if (at > 0) contains.push(station)
  }
  const byNo = (a: DirectoryStation, b: DirectoryStation) => a.no.localeCompare(b.no)
  return [...starts.sort(byNo), ...contains.sort(byNo)].slice(0, limit)
}
