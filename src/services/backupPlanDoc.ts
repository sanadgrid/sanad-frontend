import { DEFAULT_RATING_A, type BackupCase, type BackupElement } from '../features/restoration/backup/model'

// `backupPlans/{sectorId}` holds every backup case of a sector in one document,
// so opening the plans is one read however many there are. No Firebase in here.

export interface BackupPlan {
  sectorId: string
  /** The breaker rating a case is held to unless it names its own. */
  ratingA: number
  cases: BackupCase[]
}

export type PlanChange = { upsert: BackupCase } | { remove: string } | { ratingA: number }

// a stored document may not exceed 1 MiB; measured as JSON, which runs larger than what is stored
export const MAX_PLAN_BYTES = 800_000

export const emptyPlan = (sectorId: string): BackupPlan => ({ sectorId, ratingA: DEFAULT_RATING_A, cases: [] })

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')

/** `[lng, lat]` of a point on the globe, or nothing: a place that cannot be drawn is no place. */
function positionOf(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [lng, lat] = value as unknown[]
  const valid = typeof lng === 'number' && typeof lat === 'number' && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
  return valid ? [lng, lat] : undefined
}

function elementOf(raw: unknown): BackupElement {
  const { no, loadA, ratingA, at, layerId } = (raw ?? {}) as Record<string, unknown>
  const rating = positive(ratingA)
  const place = positionOf(at)
  return {
    no: text(no),
    loadA: positive(loadA) ?? 0,
    ...(rating && { ratingA: rating }),
    // the layer only says where the place was chosen: without a place it says nothing
    ...(place && { at: place, ...(text(layerId) && { layerId: text(layerId) }) }),
  }
}

/** A case as the page relies on it, whatever was stored: a hand-edited document must not break the list. */
export function caseOf(raw: unknown): BackupCase | null {
  const { id, level, voltageKv, ratingA, main, backups, note, demo } = (raw ?? {}) as Record<string, unknown>
  if (!text(id)) return null
  const rating = positive(ratingA)
  return {
    id: text(id),
    level: level === 'feeder' ? 'feeder' : 'station',
    voltageKv: positive(voltageKv) ?? 13.8,
    ...(rating && { ratingA: rating }),
    main: elementOf(main),
    backups: Array.isArray(backups) ? backups.map(elementOf).filter((b) => b.no) : [],
    ...(text(note) && { note: text(note) }),
    ...(demo === true && { demo: true }),
  }
}

export function planOf(sectorId: string, data: Record<string, unknown> | undefined): BackupPlan {
  const cases = Array.isArray(data?.cases) ? data.cases.flatMap((raw) => caseOf(raw) ?? []) : []
  return { sectorId, ratingA: positive(data?.ratingA) ?? DEFAULT_RATING_A, cases }
}

/** The plan after the changes, applied in order; a case saved again replaces itself in place. */
export function applyPlanChanges(plan: BackupPlan, changes: PlanChange[]): BackupPlan {
  let { ratingA, cases } = plan
  for (const change of changes) {
    if ('ratingA' in change) ratingA = positive(change.ratingA) ?? ratingA
    else if ('remove' in change) cases = cases.filter((c) => c.id !== change.remove)
    else {
      const saved = caseOf(change.upsert)
      if (!saved) continue
      cases = cases.some((c) => c.id === saved.id) ? cases.map((c) => (c.id === saved.id ? saved : c)) : [...cases, saved]
    }
  }
  return { sectorId: plan.sectorId, ratingA, cases }
}

export const fitsOneDocument = (plan: BackupPlan) => new TextEncoder().encode(JSON.stringify(plan)).length <= MAX_PLAN_BYTES
