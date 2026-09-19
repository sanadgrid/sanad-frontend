import type { Status } from '../engine'
import type { Position } from '../import/types'
import { ampsToMva } from './units'

// The operations team's own method, as they work it out by hand: a main element
// (a station or a feeder) is lost, and its load in amperes is shared between its
// backups, each of which can take what is left under the breaker rating.
// Pure functions, no I/O — calibrated against their worked example in model.test.ts.

export type BackupLevel = 'station' | 'feeder'

export interface BackupElement {
  no: string
  loadA: number
  /** Only when this element's rating differs from the case's. */
  ratingA?: number
  /** The very point that was chosen: a number may stand at several places. Absent, the station directory decides. */
  at?: Position
  /** The imported layer the point was chosen in. */
  layerId?: string
}

export interface BackupCase {
  id: string
  level: BackupLevel
  voltageKv: number
  /** Overrides the default rating for every backup of this case. */
  ratingA?: number
  main: BackupElement
  /** In the order they are called on: first backup, second backup, … */
  backups: BackupElement[]
  note?: string
  /** Made for a presentation, with assumed loads: said wherever the case is shown. */
  demo?: boolean
}

export interface ModelOptions {
  /** Breaker rating when neither the case nor the backup names one. */
  ratingA?: number
  /** Multiplies every rating; 1 = ratings as written. */
  derating?: number
  /** A further limit on what each backup may take, by position; `null` = none. */
  spareCapsA?: readonly (number | null)[]
}

export type LoadingLevel = 'calm' | 'near' | 'over'

export interface BackupTransfer {
  no: string
  loadA: number
  /** The rating it was held to, after derating. */
  ratingA: number
  spareA: number
  transferA: number
  finalLoadA: number
  finalLoadingPct: number
  level: LoadingLevel
}

export interface CaseResult {
  loadA: number
  totalSpareA: number
  restorableA: number
  unrestorableA: number
  /** 0 → 1; a main element without load counts as fully restorable. */
  ratio: number
  status: Status
  transfers: BackupTransfer[]
  loadMva: number
  totalSpareMva: number
  restorableMva: number
  unrestorableMva: number
}

export const DEFAULT_RATING_A = 400
const NEAR_LOADING_PCT = 80
// a backup filled exactly to its rating is at 100 %, whatever the last binary digit says
const EPSILON = 1e-9

const amps = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, value as number) : 0)

export const statusOf = (ratio: number): Status =>
  ratio >= 1 - EPSILON ? 'full' : ratio >= 0.7 ? 'high' : ratio > EPSILON ? 'limited' : 'none'

export const loadingLevel = (pct: number): LoadingLevel =>
  pct > 100 + 1e-6 ? 'over' : pct > NEAR_LOADING_PCT ? 'near' : 'calm'

export function assessCase(c: BackupCase, options: ModelOptions = {}): CaseResult {
  const derating = options.derating ?? 1
  const loadA = amps(c.main.loadA)

  const held = c.backups.map((b, i) => {
    const ratingA = amps(b.ratingA ?? c.ratingA ?? options.ratingA ?? DEFAULT_RATING_A) * derating
    const cap = options.spareCapsA?.[i]
    const spareA = Math.min(Math.max(0, ratingA - amps(b.loadA)), cap == null ? Infinity : amps(cap))
    return { no: b.no, loadA: amps(b.loadA), ratingA, spareA }
  })

  const totalSpareA = held.reduce((sum, b) => sum + b.spareA, 0)
  const restorableA = Math.min(loadA, totalSpareA)
  const unrestorableA = Math.max(0, loadA - restorableA)
  const ratio = loadA === 0 ? 1 : restorableA / loadA

  // Each backup in turn takes its share of what is still to be placed, in
  // proportion to its spare among the backups not yet called on.
  let remainingA = loadA
  let spareLeftA = totalSpareA
  const transfers = held.map((b): BackupTransfer => {
    const transferA = spareLeftA > 0 ? Math.min(b.spareA, (remainingA * b.spareA) / spareLeftA) : 0
    remainingA = Math.max(0, remainingA - transferA)
    spareLeftA -= b.spareA
    const finalLoadA = b.loadA + transferA
    const finalLoadingPct = b.ratingA > 0 ? (finalLoadA / b.ratingA) * 100 : finalLoadA > 0 ? Infinity : 0
    return { ...b, transferA, finalLoadA, finalLoadingPct, level: loadingLevel(finalLoadingPct) }
  })

  const mva = (a: number) => ampsToMva(a, c.voltageKv)
  return {
    loadA,
    totalSpareA,
    restorableA,
    unrestorableA,
    ratio,
    status: statusOf(ratio),
    transfers,
    loadMva: mva(loadA),
    totalSpareMva: mva(totalSpareA),
    restorableMva: mva(restorableA),
    unrestorableMva: mva(unrestorableA),
  }
}

export interface GroupSummary {
  key: string
  count: number
  loadA: number
  spareA: number
  restorableA: number
  unrestorableA: number
  ratio: number
  status: Status
  byStatus: Record<Status, number>
}

export interface Summary {
  groups: GroupSummary[]
  total: GroupSummary
}

const emptyGroup = (key: string): GroupSummary => ({
  key,
  count: 0,
  loadA: 0,
  spareA: 0,
  restorableA: 0,
  unrestorableA: 0,
  ratio: 1,
  status: 'full',
  byStatus: { full: 0, high: 0, limited: 0, none: 0 },
})

/** The summary block of the team's sheet: one line per group, and the grand total. */
export function summarize(cases: BackupCase[], groupBy: (c: BackupCase) => string, options: ModelOptions = {}): Summary {
  const groups = new Map<string, GroupSummary>()
  const total = emptyGroup('')
  for (const c of cases) {
    const key = groupBy(c)
    const group = groups.get(key) ?? emptyGroup(key)
    groups.set(key, group)
    const r = assessCase(c, options)
    for (const sum of [group, total]) {
      sum.count += 1
      sum.loadA += r.loadA
      sum.spareA += r.totalSpareA
      sum.restorableA += r.restorableA
      sum.unrestorableA += r.unrestorableA
      sum.byStatus[r.status] += 1
    }
  }
  for (const sum of [...groups.values(), total]) {
    sum.ratio = sum.loadA === 0 ? 1 : sum.restorableA / sum.loadA
    sum.status = statusOf(sum.ratio)
  }
  return { groups: [...groups.values()], total }
}
