import { layerIdOf } from '../import/layerId'
import type { Position } from '../import/types'
import type { LatLng } from '../types'
import { allPoints, directoryBounds, distanceKm, placesOf, type StationDirectory, type StationPoint } from './directory'
import type { ParsedStation } from './stationParse'
import { DEFAULT_STATION_LAYER } from './stationSheet'

// Stations read from a sheet, checked against the ones the sector already holds
// before anything is written: which are new, which stand where a known one
// stands, which only bring a FLOCSAP, and which fall outside the sector. Pure.

export type StationState =
  | 'new'
  /** Listed already at this very place: nothing to write. */
  | 'exists'
  /** A known number at another place: kept as one more place of it. */
  | 'moved'
  /** A known place, given a FLOCSAP it did not have or a different one. */
  | 'flocUpdate'
  | 'outside'
  /** Latitude and longitude the other way round would fall inside the sector. */
  | 'swapped'
  | 'bad'

export interface ReviewedStation {
  row: ParsedStation
  state: StationState
  /** Where it would be written, coordinates as read (or as swapped back). */
  at: LatLng | null
  /** The known place a FLOCSAP update belongs to. */
  point?: StationPoint
  /** Other station numbers given the same FLOCSAP, in the sheet or already. */
  flocClash?: string[]
}

export interface StationBox {
  south: number
  north: number
  west: number
  east: number
}

/** Where a station is the same station: closer than this to a known place. */
export const SAME_PLACE_KM = 0.005
// generous: a sector is tens of kilometres across, its box a few hundred
const BOX_DEGREES = 2
const AROUND_STATIONS = 0.5

/** Around the sector's centre, widened to take in every imported station. */
export function sectorBox(center: LatLng, directory: StationDirectory): StationBox {
  const box = { south: center.lat - BOX_DEGREES, north: center.lat + BOX_DEGREES, west: center.lng - BOX_DEGREES, east: center.lng + BOX_DEGREES }
  const bounds = directoryBounds(directory)
  if (!bounds) return box
  return {
    south: Math.min(box.south, bounds[0].lat - AROUND_STATIONS),
    north: Math.max(box.north, bounds[1].lat + AROUND_STATIONS),
    west: Math.min(box.west, bounds[0].lng - AROUND_STATIONS),
    east: Math.max(box.east, bounds[1].lng + AROUND_STATIONS),
  }
}

const onEarth = (at: LatLng) => Math.abs(at.lat) <= 90 && Math.abs(at.lng) <= 180
const inside = (box: StationBox, at: LatLng) => onEarth(at) && at.lat >= box.south && at.lat <= box.north && at.lng >= box.west && at.lng <= box.east
const near = (a: LatLng, b: LatLng) => distanceKm(a, b) <= SAME_PLACE_KM

interface ReviewContext {
  directory: StationDirectory
  box: StationBox
  /** Rows whose coordinates are to be read the other way round. */
  fixed?: ReadonlySet<number>
}

export function reviewStations(rows: ParsedStation[], { directory, box, fixed }: ReviewContext): ReviewedStation[] {
  // by FLOCSAP: the numbers that carry it, known ones first
  const carriers = new Map<string, Set<string>>()
  const carry = (floc: string, no: string) => carriers.set(floc, (carriers.get(floc) ?? new Set()).add(no))
  for (const p of allPoints(directory)) if (p.floc) carry(p.floc, p.no)
  // the places the sheet itself has given so far, so a row repeated in it is one station
  const given = new Map<string, LatLng[]>()

  const reviewed = rows.map((row): ReviewedStation => {
    if (row.problem || row.lat === null || row.lng === null) return { row, state: 'bad', at: null }
    const swap = fixed?.has(row.line) ?? false
    const at: LatLng = swap ? { lat: row.lng, lng: row.lat } : { lat: row.lat, lng: row.lng }
    if (row.floc) carry(row.floc, row.no)
    if (!inside(box, at)) return { row, state: inside(box, { lat: at.lng, lng: at.lat }) ? 'swapped' : 'outside', at }
    const known = placesOf(directory, row.no)
    const same = known.find((p) => near(p.at, at))
    // a known place with a FLOCSAP it lacks is an update, also on a second row of the sheet for it
    if (same && row.floc && row.floc !== same.floc) return { row, state: 'flocUpdate', at, point: same }
    const before = given.get(row.no) ?? []
    given.set(row.no, [...before, at])
    if (same || before.some((place) => near(place, at))) return { row, state: 'exists', at }
    return { row, state: known.length > 0 ? 'moved' : 'new', at }
  })

  return reviewed.map((r) => {
    const others = r.row.floc ? [...(carriers.get(r.row.floc) ?? [])].filter((no) => no !== r.row.no) : []
    return others.length > 0 ? { ...r, flocClash: others } : r
  })
}

/** Whether a row of this state may be written; `outside` only when asked. */
export const canImport = (state: StationState) => state === 'new' || state === 'moved' || state === 'flocUpdate' || state === 'outside'
export const importedByDefault = (state: StationState) => state === 'new' || state === 'moved' || state === 'flocUpdate'

/** The layer a sheet's station lands in, and the id it has whether or not it exists yet. */
export const stationLayerName = (row: ParsedStation) => row.layer.trim() || DEFAULT_STATION_LAYER
export const stationLayerPath = (name: string) => `stations-sheet/${name}`
export const stationLayerId = (sectorId: string, row: ParsedStation) => layerIdOf(sectorId, stationLayerName(row), stationLayerPath(stationLayerName(row)))

export interface StationPin {
  at: Position
  layerId: string
}

/** Where a plan's element stands once these stations are written: the sheet's own point, when the sheet gives the number one place. */
export function stationPins(selected: ReviewedStation[], sectorId: string): ReadonlyMap<string, StationPin> {
  const pins = new Map<string, StationPin | null>()
  for (const r of selected) {
    if (!r.at) continue
    const pin: StationPin = r.point ? { at: [r.point.at.lng, r.point.at.lat], layerId: r.point.layerId } : { at: [r.at.lng, r.at.lat], layerId: stationLayerId(sectorId, r.row) }
    // a number the sheet places twice is not settled by it
    pins.set(r.row.no, pins.has(r.row.no) ? null : pin)
  }
  return new Map([...pins].flatMap(([no, pin]) => (pin ? [[no, pin] as const] : [])))
}
