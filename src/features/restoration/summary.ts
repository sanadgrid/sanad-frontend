import type { Status } from './engine'
import type { StationRow } from './filters'

export interface Summary {
  stations: number
  loadMva: number
  /** Load-weighted: a 120 MVA station counts for more than a 15 MVA one. */
  capacityPct: number
  unrestoredMw: number
  customersAtRisk: number
  failingN1: number
  failingTransformerN1: number
  byStatus: Record<Status, number>
}

export function summarize(rows: StationRow[]): Summary {
  const byStatus: Record<Status, number> = { full: 0, high: 0, limited: 0, none: 0 }
  let loadMva = 0
  let unrestoredMva = 0
  let unrestoredMw = 0
  let customersAtRisk = 0
  let failingN1 = 0
  let failingTransformerN1 = 0

  for (const { assessment: a } of rows) {
    byStatus[a.status] += 1
    loadMva += a.loadMva
    unrestoredMva += a.unrestoredMva
    unrestoredMw += a.unrestoredMw
    customersAtRisk += a.customersAtRisk
    if (!a.n1) failingN1 += 1
    if (!a.transformerN1) failingTransformerN1 += 1
  }

  return {
    stations: rows.length,
    loadMva,
    capacityPct: loadMva > 0 ? ((loadMva - unrestoredMva) / loadMva) * 100 : 0,
    unrestoredMw,
    customersAtRisk,
    failingN1,
    failingTransformerN1,
    byStatus,
  }
}

/** Weakest restoration first; among equals, the one leaving the most load dark. */
export function byPriority(rows: StationRow[]): StationRow[] {
  return [...rows].sort(
    (a, b) =>
      a.assessment.capacityPct - b.assessment.capacityPct || b.assessment.unrestoredMva - a.assessment.unrestoredMva,
  )
}
