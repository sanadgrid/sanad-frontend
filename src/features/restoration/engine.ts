import type { Conditions, Feeder, Network, Substation, Switching, Tie } from './types'

// Restoration-capacity engine.
//
// Question answered for every substation S: if S is lost completely, how much of
// its load can be picked up by neighbouring substations through the normally-open
// ties — without overloading the tie, the receiving feeder, or the receiving
// station's firm (N-1) transformer capacity?
//
// Pure functions, no I/O: the same code can run in the browser, in a Cloud
// Function, or in a test.

/** Typical-day peak relative to the month's absolute peak. */
const NORMAL_DAY_FACTOR = 0.9
/** Used only to express unrestored load in MW. */
const POWER_FACTOR = 0.9
/** Planning assumptions for how long each restoration stage takes. */
export const STAGE_MINUTES: Record<Switching | 'temporary', number> = { remote: 10, manual: 90, temporary: 240 }

export type Limit = 'load' | 'tie' | 'feeder' | 'station'
export type Status = 'full' | 'high' | 'limited' | 'none'

export interface Transfer {
  tieId: string
  fromFeederCode: string
  toFeederCode: string
  toStationCode: string
  switching: Switching
  mva: number
  /** What stopped this tie from carrying more. */
  limitedBy: Limit
}

export interface Assessment {
  stationId: string
  loadMva: number
  firmCapacityMva: number
  /** The station's own transformers survive the loss of the largest unit. */
  transformerN1: boolean
  restoredRemoteMva: number
  restoredManualMva: number
  /** Extra pick-up from mobile generation, not counted in `capacityPct`. */
  temporaryMva: number
  unrestoredMva: number
  unrestoredMw: number
  /** Share of the load the network itself can restore (0–100). */
  capacityPct: number
  /** Share restored within the remote-switching stage (0–100). */
  remotePct: number
  /** Station-level N-1: the whole load can be restored from the network. */
  n1: boolean
  status: Status
  customers: number
  customersAtRisk: number
  transfers: Transfer[]
}

export function loadFactor(network: Network, { period, scenario }: Conditions): number {
  const { monthlyLoadFactor, forecastGrowth } = network.sector
  const base = period === 'forecast' ? Math.max(...monthlyLoadFactor) * forecastGrowth : monthlyLoadFactor[period]
  return base * (scenario === 'peak' ? 1 : NORMAL_DAY_FACTOR)
}

export function derating(network: Network, { period }: Conditions): number {
  const { monthlyDerating } = network.sector
  return period === 'forecast' ? Math.min(...monthlyDerating) : monthlyDerating[period]
}

export const firmCapacity = (s: Substation) =>
  s.transformersMva.reduce((sum, mva) => sum + mva, 0) - Math.max(0, ...s.transformersMva)

const statusFor = (pct: number): Status => (pct >= 99.5 ? 'full' : pct >= 70 ? 'high' : pct > 0 ? 'limited' : 'none')

const round1 = (n: number) => Math.round(n * 10) / 10

/** Assess every substation of the network under the given conditions. */
export function assessNetwork(network: Network, conditions: Conditions): Map<string, Assessment> {
  const k = loadFactor(network, conditions)
  const d = derating(network, conditions)

  const feederById = new Map(network.feeders.map((f) => [f.id, f]))
  const stationById = new Map(network.substations.map((s) => [s.id, s]))
  const feedersOf = new Map<string, Feeder[]>()
  for (const f of network.feeders) feedersOf.set(f.stationId, [...(feedersOf.get(f.stationId) ?? []), f])

  const stationLoad = new Map<string, number>()
  for (const s of network.substations)
    stationLoad.set(s.id, (feedersOf.get(s.id) ?? []).reduce((sum, f) => sum + f.peakLoadMva * k, 0))

  const results = new Map<string, Assessment>()

  for (const lost of network.substations) {
    const own = feedersOf.get(lost.id) ?? []
    const remaining = new Map(own.map((f) => [f.id, f.peakLoadMva * k]))
    // headroom is consumed as transfers are allocated, so two ties landing on the
    // same feeder or the same station cannot both claim the same spare MVA
    const feederSpare = new Map<string, number>()
    const stationSpare = new Map<string, number>()

    // remote-controlled ties first (they restore in minutes), then the biggest
    const candidates = network.ties
      .map((tie) => orient(tie, lost.id, feederById))
      .filter((c): c is OrientedTie => c !== null)
      .sort(
        (a, b) =>
          Number(b.tie.switching === 'remote') - Number(a.tie.switching === 'remote') ||
          b.tie.capacityMva - a.tie.capacityMva,
      )

    const transfers: Transfer[] = []
    // totals use the exact MVA: summing the rounded per-transfer figures can lose
    // a few tenths and turn a fully restored station into 99 % / N-1 failed
    const restored: Record<Switching, number> = { remote: 0, manual: 0 }
    for (const { tie, mine, theirs } of candidates) {
      const host = stationById.get(theirs.stationId)
      if (!host) continue
      if (!feederSpare.has(theirs.id)) feederSpare.set(theirs.id, Math.max(0, theirs.ratingMva * d - theirs.peakLoadMva * k))
      if (!stationSpare.has(host.id))
        stationSpare.set(host.id, Math.max(0, firmCapacity(host) - (stationLoad.get(host.id) ?? 0)))

      const limits: [Limit, number][] = [
        ['load', remaining.get(mine.id) ?? 0],
        ['tie', tie.capacityMva * d],
        ['feeder', feederSpare.get(theirs.id) ?? 0],
        ['station', stationSpare.get(host.id) ?? 0],
      ]
      const [limitedBy, mva] = limits.reduce((min, l) => (l[1] < min[1] ? l : min))
      if (mva <= 0.05) continue

      remaining.set(mine.id, (remaining.get(mine.id) ?? 0) - mva)
      feederSpare.set(theirs.id, (feederSpare.get(theirs.id) ?? 0) - mva)
      stationSpare.set(host.id, (stationSpare.get(host.id) ?? 0) - mva)
      restored[tie.switching] += mva
      transfers.push({
        tieId: tie.id,
        fromFeederCode: mine.code,
        toFeederCode: theirs.code,
        toStationCode: host.code,
        switching: tie.switching,
        mva: round1(mva),
        limitedBy,
      })
    }

    const loadMva = stationLoad.get(lost.id) ?? 0
    const restoredRemoteMva = restored.remote
    const restoredManualMva = restored.manual
    const afterNetwork = Math.max(0, loadMva - restoredRemoteMva - restoredManualMva)
    const temporaryMva = Math.min(afterNetwork, lost.temporarySupplyMva)
    const capacityPct = loadMva > 0 ? Math.min(100, ((loadMva - afterNetwork) / loadMva) * 100) : 100
    const customers = own.reduce((sum, f) => sum + f.customers, 0)
    const firm = firmCapacity(lost)

    results.set(lost.id, {
      stationId: lost.id,
      loadMva: round1(loadMva),
      firmCapacityMva: firm,
      transformerN1: loadMva <= firm,
      restoredRemoteMva: round1(restoredRemoteMva),
      restoredManualMva: round1(restoredManualMva),
      temporaryMva: round1(temporaryMva),
      unrestoredMva: round1(afterNetwork),
      unrestoredMw: round1(afterNetwork * POWER_FACTOR),
      capacityPct: Math.round(capacityPct),
      remotePct: loadMva > 0 ? Math.round((restoredRemoteMva / loadMva) * 100) : 100,
      n1: capacityPct >= 99.5,
      status: statusFor(capacityPct),
      customers,
      customersAtRisk: Math.round(customers * (1 - capacityPct / 100)),
      transfers,
    })
  }

  return results
}

interface OrientedTie {
  tie: Tie
  /** The end on the lost station. */
  mine: Feeder
  /** The end on the neighbouring station. */
  theirs: Feeder
}

function orient(tie: Tie, lostStationId: string, feederById: Map<string, Feeder>): OrientedTie | null {
  const from = feederById.get(tie.fromFeederId)
  const to = feederById.get(tie.toFeederId)
  if (!from || !to || from.stationId === to.stationId) return null
  if (from.stationId === lostStationId) return { tie, mine: from, theirs: to }
  if (to.stationId === lostStationId) return { tie, mine: to, theirs: from }
  return null
}
