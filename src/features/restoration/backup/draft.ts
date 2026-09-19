import { normalizeQuery } from '../import/stations'
import type { Position } from '../import/types'
import { placesOf, toPosition, type StationDirectory, type StationPoint } from './directory'
import type { BackupCase, BackupElement, BackupLevel } from './model'

// A backup plan while it is being written: what the form holds, and every change
// the form or a click on the map can make to it. Pure — nothing here reads anything.

export interface DraftRow {
  /** Stays with the line when it moves up or down. */
  key: string
  no: string
  load: string
  at?: Position
  layerId?: string
}

export interface PlanDraft {
  id: string
  level: BackupLevel
  voltageKv: number
  main: DraftRow
  backups: DraftRow[]
  rating: string
  note: string
  demo: boolean
}

/** The line a change is for: the main element, or a backup by its position. */
export type RowTarget = 'main' | number

export const DEFAULT_BACKUPS = 3
/** More backups than this is unusual enough to say so. */
export const MANY_BACKUPS = 5
export const DEMO_MAIN_A = 320
export const DEMO_BACKUPS_A = [270, 285, 260, 250, 275]
export const DEMO_NOTE = 'تجريبي — أحمال افتراضية للعرض'

let serial = 0
export const emptyRow = (): DraftRow => ({ key: `row-${(serial += 1)}`, no: '', load: '' })

// digits typed on an Arabic keyboard count too
export const numberOf = (text: string) => {
  const value = Number(normalizeQuery(text).replace('٫', '.'))
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null
}

const rowOf = (element: BackupElement): DraftRow => ({
  ...emptyRow(),
  no: element.no,
  load: String(element.loadA),
  ...(element.at && { at: element.at }),
  ...(element.layerId && { layerId: element.layerId }),
})

export function draftOf(initial: BackupCase | undefined, id: string): PlanDraft {
  const backups = (initial?.backups ?? []).map(rowOf)
  while (backups.length < DEFAULT_BACKUPS) backups.push(emptyRow())
  return {
    id: initial?.id ?? id,
    level: initial?.level ?? 'station',
    voltageKv: initial?.voltageKv ?? 13.8,
    main: initial ? rowOf(initial.main) : emptyRow(),
    backups,
    rating: initial?.ratingA ? String(initial.ratingA) : '',
    note: initial?.note ?? '',
    demo: initial?.demo === true,
  }
}

const elementOf = (row: DraftRow): BackupElement => ({
  no: normalizeQuery(row.no),
  loadA: numberOf(row.load) ?? 0,
  ...(row.at && { at: row.at }),
  ...(row.at && row.layerId && { layerId: row.layerId }),
})

/** The lines that count: one without a number is a line not used, as a blank cell is in the sheet. */
export const usedBackups = (draft: PlanDraft) => draft.backups.filter((row) => row.no.trim())

/** Blank lines go last, so the position of a backup is its number in the plan. */
export const compact = (draft: PlanDraft): PlanDraft => ({
  ...draft,
  backups: [...usedBackups(draft), ...draft.backups.filter((row) => !row.no.trim())],
})

export function toCase(draft: PlanDraft): BackupCase {
  const override = numberOf(draft.rating)
  return {
    id: draft.id,
    level: draft.level,
    voltageKv: draft.voltageKv,
    ...(override && { ratingA: override }),
    main: elementOf(draft.main),
    backups: usedBackups(draft).map(elementOf),
    ...(draft.note.trim() && { note: draft.note.trim() }),
    ...(draft.demo && { demo: true }),
  }
}

export const isComplete = (draft: PlanDraft) =>
  Boolean(draft.main.no.trim()) && numberOf(draft.main.load) !== null && draft.backups.every((row) => !row.no.trim() || numberOf(row.load) !== null)

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
const placed = (row: DraftRow, point: StationPoint): DraftRow => ({ ...row, at: toPosition(point.at), layerId: point.layerId })
const unplaced = ({ key, no, load }: DraftRow): DraftRow => ({ key, no, load })

/**
 * A number as it is typed. One place on the map: the line takes it without
 * asking. Several: a place chosen earlier stands while it is still one of them,
 * otherwise the choice is the user's to make.
 */
export function withNumber(row: DraftRow, no: string, directory: StationDirectory): DraftRow {
  const places = placesOf(directory, no)
  const kept = row.at && places.find((p) => samePosition(toPosition(p.at), row.at as Position))
  const place = kept || (places.length === 1 ? places[0] : null)
  return place ? placed({ ...row, no }, place) : unplaced({ ...row, no })
}

/** One of the places of the line's number, chosen by hand. */
export const withPlace = (row: DraftRow, point: StationPoint): DraftRow => placed(row, point)

export function setRow(draft: PlanDraft, target: RowTarget, change: (row: DraftRow) => DraftRow): PlanDraft {
  if (target === 'main') return { ...draft, main: change(draft.main) }
  return { ...draft, backups: draft.backups.map((row, i) => (i === target ? change(row) : row)) }
}

/** The order is the order the backups are called on; a line moves whole, with its load and its place. */
export function moveBackup(draft: PlanDraft, index: number, by: 1 | -1): PlanDraft {
  const to = index + by
  if (index < 0 || to < 0 || index >= draft.backups.length || to >= draft.backups.length) return draft
  const { backups } = draft
  return { ...draft, backups: backups.map((row, i) => (i === index ? backups[to] : i === to ? backups[index] : row)) }
}

const holds = (row: DraftRow, point: StationPoint) =>
  Boolean(row.at) && samePosition(row.at as Position, toPosition(point.at)) && normalizeQuery(row.no) === point.no

/** What the next click on the map sets: the main element first, then the backups in order. */
export function nextTarget(draft: PlanDraft): RowTarget {
  if (!draft.main.no.trim()) return 'main'
  const free = draft.backups.findIndex((row) => !row.no.trim())
  return free < 0 ? draft.backups.length : free
}

/**
 * A click on a station of the map. One already in the plan is taken out of it
 * (the main element leaves its line empty, to be set again); any other becomes
 * the main element, then the next backup.
 */
export function pick(draft: PlanDraft, point: StationPoint): PlanDraft {
  if (holds(draft.main, point)) return { ...draft, main: { key: draft.main.key, no: '', load: draft.main.load } }
  if (draft.backups.some((row) => holds(row, point))) return { ...draft, backups: draft.backups.filter((row) => !holds(row, point)) }
  const target = nextTarget(draft)
  const set = (row: DraftRow) => placed({ ...row, no: point.no }, point)
  const next = target === draft.backups.length ? { ...draft, backups: [...draft.backups, set(emptyRow())] } : setRow(draft, target, set)
  // a plan made for a presentation gives the new line its assumed load at once
  return draft.demo ? withDemoLoads(next) : next
}

const blank = (row: DraftRow) => !row.load.trim()

function withDemoLoads(draft: PlanDraft): PlanDraft {
  let order = 0
  return {
    ...draft,
    main: blank(draft.main) ? { ...draft.main, load: String(DEMO_MAIN_A) } : draft.main,
    backups: draft.backups.map((row) => {
      if (!row.no.trim()) return row
      const load = DEMO_BACKUPS_A[order % DEMO_BACKUPS_A.length]
      order += 1
      return blank(row) ? { ...row, load: String(load) } : row
    }),
  }
}

/** Plausible loads for a presentation — into empty fields only, and the case says that it is a demonstration. */
export const fillDemoLoads = (draft: PlanDraft): PlanDraft => ({
  ...withDemoLoads(draft),
  demo: true,
  note: draft.note.trim() ? draft.note : DEMO_NOTE,
})
