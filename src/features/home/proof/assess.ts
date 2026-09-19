import { assessCase, statusOf, type BackupCase } from '../../restoration/backup/model'
import type { Status } from '../../restoration/engine'
import { ampsToMva } from '../../restoration/backup/units'
import { feeders, VOLTAGE_KV } from './dataset'

export const RATING_MAX_A = 400
export const RATING_MIN_A = 320

export interface FeederCell {
  id: string
  loadA: number
  restorableA: number
  ratio: number
  status: Status
}

export interface Picture {
  ratingA: number
  loadA: number
  unrestorableA: number
  unrestorableMva: number
  /** Restored share of the whole load, in percent. */
  percent: number
  status: Status
  byStatus: Record<Status, number>
  cells: FeederCell[]
}

/** The whole sheet under one assumed feeder rating — what the slider redraws. */
export function pictureAt(ratingA: number, cases: BackupCase[] = feeders): Picture {
  const byStatus: Record<Status, number> = { full: 0, high: 0, limited: 0, none: 0 }
  let loadA = 0
  let restorableA = 0
  const cells = cases.map((c): FeederCell => {
    const r = assessCase(c, { ratingA })
    loadA += r.loadA
    restorableA += r.restorableA
    byStatus[r.status] += 1
    return { id: c.id, loadA: r.loadA, restorableA: r.restorableA, ratio: r.ratio, status: r.status }
  })
  const ratio = loadA === 0 ? 1 : restorableA / loadA
  const unrestorableA = loadA - restorableA
  return {
    ratingA,
    loadA,
    unrestorableA,
    unrestorableMva: ampsToMva(unrestorableA, VOLTAGE_KV),
    percent: ratio * 100,
    status: statusOf(ratio),
    byStatus,
    cells,
  }
}
