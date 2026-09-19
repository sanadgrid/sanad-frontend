import { derating as thermalDerating, firmCapacity, loadFactor } from '../engine'
import type { Conditions, Feeder, Network, Substation } from '../types'
import { assessCase, type BackupCase, type CaseResult } from './model'
import { mvaToAmps } from './units'

// The bridge between the two views of the same question. The network knows
// feeders, ties and MVA; the team's method knows a main element, its backups and
// amperes. "If this feeder is lost" is that method applied to the network: the
// backups are the feeders at the far end of its ties.

export interface FeederRow {
  feeder: Feeder
  loadMva: number
  loadA: number
  ratingA: number
  loadingPct: number
  /** Ties to feeders of other stations. */
  backups: number
}

export interface FeederBackup {
  feeder: Feeder
  station: Substation
  tieIds: string[]
  /** What the receiving station can still take within its firm capacity, in amperes at its voltage. */
  stationSpareA: number
}

export interface FeederCase {
  feeder: Feeder
  station: Substation
  case: BackupCase
  /** In the order of `case.backups`. */
  backups: FeederBackup[]
  /** The engine's thermal derating for the period. */
  derating: number
}

export interface FeederAssumptions {
  /** Hold every rating to the period's thermal derating. */
  derated: boolean
  /** Let no receiving station go beyond its firm capacity. */
  firmCapacity: boolean
}

export const SHEET_METHOD: FeederAssumptions = { derated: false, firmCapacity: false }

const farEnds = (network: Network, feederId: string) =>
  network.ties.flatMap((tie) =>
    tie.fromFeederId === feederId ? [{ tie, otherId: tie.toFeederId }] : tie.toFeederId === feederId ? [{ tie, otherId: tie.fromFeederId }] : [],
  )

/** The feeders of a station under the given conditions, in amperes as well. */
export function stationFeeders(network: Network, stationId: string, conditions: Conditions): FeederRow[] {
  const station = network.substations.find((s) => s.id === stationId)
  if (!station) return []
  const k = loadFactor(network, conditions)
  const stationOf = new Map(network.feeders.map((f) => [f.id, f.stationId]))
  return network.feeders
    .filter((f) => f.stationId === stationId)
    .map((feeder) => {
      const loadMva = feeder.peakLoadMva * k
      return {
        feeder,
        loadMva,
        loadA: mvaToAmps(loadMva, station.voltageKv),
        ratingA: mvaToAmps(feeder.ratingMva, station.voltageKv),
        loadingPct: feeder.ratingMva > 0 ? (loadMva / feeder.ratingMva) * 100 : 0,
        backups: new Set(farEnds(network, feeder.id).map((end) => end.otherId).filter((id) => stationOf.get(id) !== stationId)).size,
      }
    })
}

/** The loss of one feeder as a backup case; `null` when the feeder or its station is unknown. */
export function feederCase(network: Network, feederId: string, conditions: Conditions): FeederCase | null {
  const feederById = new Map(network.feeders.map((f) => [f.id, f]))
  const stationById = new Map(network.substations.map((s) => [s.id, s]))
  const feeder = feederById.get(feederId)
  const station = feeder && stationById.get(feeder.stationId)
  if (!feeder || !station) return null
  const k = loadFactor(network, conditions)
  const stationLoadMva = (id: string) => network.feeders.reduce((sum, f) => (f.stationId === id ? sum + f.peakLoadMva * k : sum), 0)

  const backups = new Map<string, FeederBackup>()
  for (const { tie, otherId } of farEnds(network, feederId)) {
    const other = feederById.get(otherId)
    const host = other && stationById.get(other.stationId)
    // like the engine: a tie inside one station is not a way out of it
    if (!other || !host || host.id === station.id) continue
    const known = backups.get(other.id)
    if (known) known.tieIds.push(tie.id)
    else
      backups.set(other.id, {
        feeder: other,
        station: host,
        tieIds: [tie.id],
        stationSpareA: mvaToAmps(Math.max(0, firmCapacity(host) - stationLoadMva(host.id)), host.voltageKv),
      })
  }

  const list = [...backups.values()]
  return {
    feeder,
    station,
    backups: list,
    derating: thermalDerating(network, conditions),
    case: {
      id: feeder.id,
      level: 'feeder',
      voltageKv: station.voltageKv,
      ratingA: mvaToAmps(feeder.ratingMva, station.voltageKv),
      main: { no: `${station.code}/${feeder.code}`, loadA: mvaToAmps(feeder.peakLoadMva * k, station.voltageKv) },
      backups: list.map((b) => ({
        no: `${b.station.code}/${b.feeder.code}`,
        loadA: mvaToAmps(b.feeder.peakLoadMva * k, b.station.voltageKv),
        ratingA: mvaToAmps(b.feeder.ratingMva, b.station.voltageKv),
      })),
    },
  }
}

/**
 * With nothing switched on this is the team's method as it stands. The firm
 * capacity of a station that receives through several feeders is shared between
 * them in proportion to their spare, so it is never counted twice.
 */
export function assessFeederCase(fc: FeederCase, assumptions: FeederAssumptions = SHEET_METHOD): CaseResult {
  const options = { derating: assumptions.derated ? fc.derating : 1 }
  const free = assessCase(fc.case, options)
  if (!assumptions.firmCapacity) return free
  const spareInto = new Map<string, number>()
  fc.backups.forEach((b, i) => spareInto.set(b.station.id, (spareInto.get(b.station.id) ?? 0) + free.transfers[i].spareA))
  const spareCapsA = fc.backups.map((b, i) => {
    const total = spareInto.get(b.station.id) ?? 0
    return total > 0 ? (b.stationSpareA * free.transfers[i].spareA) / total : 0
  })
  return assessCase(fc.case, { ...options, spareCapsA })
}
