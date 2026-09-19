import type { Status } from '../engine'
import { normalizeQuery } from '../import/stations'
import type { BackupLevel } from './model'
import type { CaseRow } from './planNetwork'

export type DemoFilter = 'all' | 'only' | 'without'

export interface PlanFilters {
  /** A station or feeder number, main or backup. */
  search: string
  status: Status | null
  level: BackupLevel | null
  voltageKv: number | null
  below100: boolean
  /** Cases one of whose backups would stand above its rating. */
  overRated: boolean
  demo: DemoFilter
}

export const defaultPlanFilters: PlanFilters = { search: '', status: null, level: null, voltageKv: null, below100: false, overRated: false, demo: 'all' }

/** How many filters narrow the cases — the number on the filters button. */
export const countActive = (f: PlanFilters) =>
  [f.search.trim(), f.status, f.level, f.voltageKv, f.below100, f.overRated, f.demo !== 'all'].filter(Boolean).length

export function matchesRow({ plan, result, links }: CaseRow, f: PlanFilters): boolean {
  const search = normalizeQuery(f.search)
  return (
    (!search || [plan.main, ...plan.backups].some((e) => normalizeQuery(e.no).includes(search))) &&
    (!f.status || result.status === f.status) &&
    (!f.level || plan.level === f.level) &&
    (!f.voltageKv || plan.voltageKv === f.voltageKv) &&
    (!f.below100 || result.status !== 'full') &&
    (!f.overRated || links.some((link) => link.level === 'over')) &&
    (f.demo === 'all' || (f.demo === 'only') === Boolean(plan.demo))
  )
}
