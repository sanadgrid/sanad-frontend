import { DEFAULT_RATING_A, type BackupCase, type BackupElement } from '../features/restoration/backup/model'

// `backupPlans/{sectorId}` holds every backup case of a sector in one document,
// so opening the plans is one read however many there are. No Firebase in here.

export interface BackupPlan {
  sectorId: string
  /** The breaker rating a case is held to unless it names its own. */
  ratingA: number
  cases: BackupCase[]
  /** Deleted cases, newest last: kept for thirty days so a deletion can be taken back. */
  trash: TrashedCase[]
}

export interface TrashedCase {
  case: BackupCase
  /** Milliseconds since the epoch, by the clock of whoever deleted it. */
  deletedAt: number
  deletedBy?: string
}

export type PlanChange =
  /** `keepReplaced`: the case it replaces, if it differs, goes to the trash — a bulk entry overwriting a plan. */
  | { upsert: BackupCase; keepReplaced?: boolean }
  /** Into the trash. `at` is given by the caller, so it can name the trashed case afterwards. */
  | { remove: string; at?: number }
  /** Out of the trash, by `trashKey`; a live case with the same id takes its place there. */
  | { restore: string }
  /** Gone for good, by `trashKey`. */
  | { purge: string }
  | { ratingA: number }

/** When and by whom the changes are made. */
export interface ChangeContext {
  now?: number
  by?: string
}

// a stored document may not exceed 1 MiB; measured as JSON, which runs larger than what is stored
export const MAX_PLAN_BYTES = 800_000
export const TRASH_DAYS = 30
export const TRASH_MS = TRASH_DAYS * 24 * 60 * 60_000
export const MAX_TRASH = 200

export const emptyPlan = (sectorId: string): BackupPlan => ({ sectorId, ratingA: DEFAULT_RATING_A, cases: [], trash: [] })

/** A case may be deleted, written again and deleted again: the moment tells the copies apart. */
export const trashKey = (caseId: string, deletedAt: number) => `${caseId}@${deletedAt}`
export const keyOfTrashed = (item: TrashedCase) => trashKey(item.case.id, item.deletedAt)

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

function trashedOf(raw: unknown): TrashedCase | null {
  const { case: kept, deletedAt, deletedBy } = (raw ?? {}) as Record<string, unknown>
  const saved = caseOf(kept)
  const at = positive(deletedAt)
  return saved && at ? { case: saved, deletedAt: at, ...(text(deletedBy) && { deletedBy: text(deletedBy) }) } : null
}

export function planOf(sectorId: string, data: Record<string, unknown> | undefined): BackupPlan {
  const cases = Array.isArray(data?.cases) ? data.cases.flatMap((raw) => caseOf(raw) ?? []) : []
  const trash = Array.isArray(data?.trash) ? data.trash.flatMap((raw) => trashedOf(raw) ?? []) : []
  return { sectorId, ratingA: positive(data?.ratingA) ?? DEFAULT_RATING_A, cases, trash }
}

/** What the trash keeps: thirty days, and no more than it has room for — the oldest go first. */
export const tidyTrash = (trash: TrashedCase[], now: number): TrashedCase[] =>
  [...trash]
    .filter((item) => now - item.deletedAt < TRASH_MS)
    .sort((a, b) => a.deletedAt - b.deletedAt)
    .slice(-MAX_TRASH)

/**
 * The plan after the changes, applied in order; a case saved again replaces
 * itself in place. Nothing is deleted outright: a removed case waits in the trash.
 */
export function applyPlanChanges(plan: BackupPlan, changes: PlanChange[], { now = Date.now(), by }: ChangeContext = {}): BackupPlan {
  let { ratingA, cases } = plan
  let trash = plan.trash ?? []
  const discard = (kept: BackupCase, at: number) => {
    trash = [...trash, { case: kept, deletedAt: at, ...(by && { deletedBy: by }) }]
  }
  for (const change of changes) {
    if ('ratingA' in change) ratingA = positive(change.ratingA) ?? ratingA
    else if ('remove' in change) {
      const gone = cases.find((c) => c.id === change.remove)
      if (!gone) continue
      cases = cases.filter((c) => c !== gone)
      discard(gone, change.at ?? now)
    } else if ('restore' in change) {
      const back = trash.find((item) => keyOfTrashed(item) === change.restore)
      if (!back) continue
      trash = trash.filter((item) => item !== back)
      const live = cases.find((c) => c.id === back.case.id)
      if (live) discard(live, now)
      cases = live ? cases.map((c) => (c === live ? back.case : c)) : [...cases, back.case]
    } else if ('purge' in change) trash = trash.filter((item) => keyOfTrashed(item) !== change.purge)
    else {
      const saved = caseOf(change.upsert)
      if (!saved) continue
      const before = cases.find((c) => c.id === saved.id)
      if (before && change.keepReplaced && JSON.stringify(before) !== JSON.stringify(saved)) discard(before, now)
      cases = before ? cases.map((c) => (c === before ? saved : c)) : [...cases, saved]
    }
  }
  return { sectorId: plan.sectorId, ratingA, cases, trash: tidyTrash(trash, now) }
}

export const fitsOneDocument = (plan: BackupPlan) => new TextEncoder().encode(JSON.stringify(plan)).length <= MAX_PLAN_BYTES

/** The trash never costs the sector a plan: when the document runs out of room, its oldest items leave first. */
export function fitPlan(plan: BackupPlan): BackupPlan {
  let fitted = plan
  while (fitted.trash.length > 0 && !fitsOneDocument(fitted)) fitted = { ...fitted, trash: fitted.trash.slice(Math.ceil(fitted.trash.length / 4)) }
  return fitted
}
