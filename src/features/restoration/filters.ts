import type { Assessment } from './engine'
import type { Network, StationType, Substation } from './types'

/** A substation together with its assessment under the current conditions. */
export interface StationRow {
  station: Substation
  assessment: Assessment
}

export type Range = [min: number, max: number]

export interface Filters {
  areaId: string | null
  department: string | null
  type: StationType | null
  voltageKv: number | null
  /** `null` = the whole slider, so a changed period never hides stations by accident. */
  loadMva: Range | null
  customersK: Range | null
  search: string
  failingN1: boolean
  temporarySupply: boolean
}

export interface Layers {
  sensitive: boolean
  vip: boolean
  ties: boolean
}

export interface Bounds {
  loadMva: Range
  customersK: Range
}

export const defaultFilters: Filters = {
  areaId: null,
  department: null,
  type: null,
  voltageKv: null,
  loadMva: null,
  customersK: null,
  search: '',
  failingN1: false,
  temporarySupply: false,
}

export const defaultLayers: Layers = { sensitive: true, vip: true, ties: true }

const roundUp = (value: number, step: number) => Math.max(step, Math.ceil(value / step) * step)

/** Slider extents, fixed per network (forecast peak) so they do not jump with the period. */
export function boundsOf(network: Network): Bounds {
  const load = new Map<string, number>()
  const customers = new Map<string, number>()
  for (const f of network.feeders) {
    load.set(f.stationId, (load.get(f.stationId) ?? 0) + f.peakLoadMva)
    customers.set(f.stationId, (customers.get(f.stationId) ?? 0) + f.customers)
  }
  const growth = Math.max(1, network.sector.forecastGrowth)
  return {
    loadMva: [0, roundUp(Math.max(0, ...load.values()) * growth, 10)],
    customersK: [0, roundUp(Math.max(0, ...customers.values()) / 1000, 5)],
  }
}

const inRange = (value: number, range: Range | null) => !range || (value >= range[0] && value <= range[1])

export function matches({ station, assessment }: StationRow, f: Filters): boolean {
  const search = f.search.trim().toLowerCase()
  return (
    (!f.areaId || station.areaId === f.areaId) &&
    (!f.department || station.department === f.department) &&
    (!f.type || station.type === f.type) &&
    (!f.voltageKv || station.voltageKv === f.voltageKv) &&
    inRange(assessment.loadMva, f.loadMva) &&
    inRange(assessment.customers / 1000, f.customersK) &&
    (!search || station.code.toLowerCase().includes(search) || station.district.toLowerCase().includes(search)) &&
    (!f.failingN1 || !assessment.n1) &&
    (!f.temporarySupply || station.temporarySupplyMva > 0)
  )
}
