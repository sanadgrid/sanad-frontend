import { normalizeQuery, stationNameOf, stationNoOf, type StationEntry } from '../import/stations'
import type { Position } from '../import/types'
import type { LatLng } from '../types'

// Where a station of a backup plan stands on the map. The places come from the
// station lists of the imported layers, which the page already holds — looking
// one up reads nothing. A number may stand at several places: each is kept, and a
// plan element that names its own place (`at`) is drawn there.

/** One place a station number stands at. */
export interface StationPoint {
  no: string
  name: string
  at: LatLng
  /** The layer it was first listed by, and that layer's name. */
  layerId: string
  layerName: string
}

export interface DirectoryStation extends StationPoint {
  /** Every layer that lists the station: selecting a plan switches them on. */
  layerIds: string[]
  /** Every distinct place of the number; the first is the station's own `at`. */
  points: StationPoint[]
}

export type StationDirectory = ReadonlyMap<string, DirectoryStation>

interface ListedLayer {
  id: string
  name?: string
  stations?: StationEntry[]
}

const samePlace = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng

export const toLatLng = ([lng, lat]: Position): LatLng => ({ lat, lng })
export const toPosition = ({ lat, lng }: LatLng): Position => [lng, lat]

export function buildDirectory(layers: ListedLayer[]): StationDirectory {
  const directory = new Map<string, DirectoryStation>()
  for (const layer of layers)
    for (const station of layer.stations ?? []) {
      const point: StationPoint = { no: station.no, name: stationNameOf(station), at: toLatLng(station.c), layerId: layer.id, layerName: layer.name ?? '' }
      const known = directory.get(station.no)
      if (!known) {
        directory.set(station.no, { ...point, layerIds: [layer.id], points: [point] })
        continue
      }
      if (!known.layerIds.includes(layer.id)) known.layerIds.push(layer.id)
      // the same place listed by a second layer is still one place
      if (!known.points.some((p) => samePlace(p.at, point.at))) known.points.push(point)
    }
  return directory
}

/** One place of one number — the key of a station of the plans on the map, too. */
export const placeKey = (point: { no: string; at: LatLng }) => `${point.no}@${point.at.lng},${point.at.lat}`

/**
 * The quiet squares of the map: every place of every station, whatever layers
 * are switched on. A station of the plans is drawn by the plans (`drawn`, by
 * `placeKey`), and one listed by a layer that is shown (`shown`) by that layer —
 * no place is ever marked twice.
 */
export function baseStations(layers: ListedLayer[], drawn: ReadonlySet<string>, shown: ReadonlySet<string>): StationPoint[] {
  const places = new Map<string, { point: StationPoint; covered: boolean }>()
  for (const layer of layers)
    for (const station of layer.stations ?? []) {
      const point: StationPoint = { no: station.no, name: stationNameOf(station), at: toLatLng(station.c), layerId: layer.id, layerName: layer.name ?? '' }
      const key = placeKey(point)
      const known = places.get(key)
      if (known) known.covered ||= shown.has(layer.id)
      else places.set(key, { point, covered: shown.has(layer.id) })
    }
  return [...places].flatMap(([key, { point, covered }]) => (covered || drawn.has(key) ? [] : [point]))
}

/** A plan may name a feeder ("7001/F3"): it stands where its station does. */
export const locate = (directory: StationDirectory, no: string) =>
  directory.get(stationNoOf(normalizeQuery(no)) ?? normalizeQuery(no)) ?? null

/** Every place the number stands at; more than one asks for a choice. */
export const placesOf = (directory: StationDirectory, no: string): StationPoint[] => locate(directory, no)?.points ?? []

/** Where an element of a plan is drawn: the place it names, else the first the directory knows. */
export const placeOf = (directory: StationDirectory, element: { no: string; at?: Position }): LatLng | null =>
  element.at ? toLatLng(element.at) : (locate(directory, element.no)?.at ?? null)

/** Every place of every number — what can be picked on the map. */
export const allPoints = (directory: StationDirectory): StationPoint[] => [...directory.values()].flatMap((station) => station.points)

/** The box around every place, for a first view; `null` for an empty directory. */
export function directoryBounds(directory: StationDirectory): [LatLng, LatLng] | null {
  let box: [LatLng, LatLng] | null = null
  for (const station of directory.values())
    for (const { at } of station.points) {
      if (!box) box = [{ ...at }, { ...at }]
      box[0].lat = Math.min(box[0].lat, at.lat)
      box[0].lng = Math.min(box[0].lng, at.lng)
      box[1].lat = Math.max(box[1].lat, at.lat)
      box[1].lng = Math.max(box[1].lng, at.lng)
    }
  return box
}

const EARTH_KM = 6371

/** Great-circle distance, good to a few metres at the scale of a sector. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

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
