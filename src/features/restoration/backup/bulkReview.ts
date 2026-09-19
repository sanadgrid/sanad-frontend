import type { ParsedRow } from './bulkParse'
import { placesOf, toPosition, type StationDirectory } from './directory'
import { assessCase, summarize, type BackupCase, type BackupElement, type CaseResult, type ModelOptions } from './model'

// Pasted rows, checked against what the sector already holds before anything is
// written: which numbers the imported stations know, which stand at several
// places, and which main elements already have a plan. Pure.

export type DuplicateChoice = 'replace' | 'skip'

export interface ReviewedRow {
  row: ParsedRow
  /** The case the row would be saved as; `null` for a row that cannot be read. */
  plan: BackupCase | null
  result: CaseResult | null
  /** Numbers the imported stations do not list: saved, but not drawn. */
  notFound: string[]
  /** Numbers that stand at several places: saved without a point, to be chosen by hand later. */
  ambiguous: string[]
  /** Its main element already has a plan — in the sector, or higher up in the same rows. */
  duplicate: 'existing' | 'pasted' | null
}

interface ReviewContext {
  existing: BackupCase[]
  directory: StationDirectory
  options: ModelOptions
  newId: () => string
}

export function reviewRows(rows: ParsedRow[], { existing, directory, options, newId }: ReviewContext): ReviewedRow[] {
  const idOfMain = new Map(existing.map((c) => [c.main.no, c.id] as const).reverse())
  const pasted = new Set<string>()
  const hasDirectory = directory.size > 0

  return rows.map((row): ReviewedRow => {
    if (row.problems.length > 0) return { row, plan: null, result: null, notFound: [], ambiguous: [], duplicate: null }
    const notFound = new Set<string>()
    const ambiguous = new Set<string>()
    const element = ({ no, loadA }: { no: string; loadA: number }): BackupElement => {
      const places = placesOf(directory, no)
      if (places.length === 0 && hasDirectory) notFound.add(no)
      if (places.length > 1) ambiguous.add(no)
      // one place: the element stands there without asking, as it does in the form
      return places.length === 1 ? { no, loadA, at: toPosition(places[0].at), layerId: places[0].layerId } : { no, loadA }
    }

    const duplicate = pasted.has(row.main.no) ? 'pasted' : idOfMain.has(row.main.no) ? 'existing' : null
    const id = idOfMain.get(row.main.no) ?? newId()
    idOfMain.set(row.main.no, id)
    pasted.add(row.main.no)

    const plan: BackupCase = {
      id,
      level: row.level ?? 'station',
      voltageKv: row.voltageKv ?? 13.8,
      ...(row.ratingA && { ratingA: row.ratingA }),
      main: element(row.main),
      backups: row.backups.map(element),
      ...(row.note && { note: row.note }),
      ...(row.demo && { demo: true }),
    }
    return { row, plan, result: assessCase(plan, options), notFound: [...notFound], ambiguous: [...ambiguous], duplicate }
  })
}

/** What goes to the database, in order: a row that replaces another comes after it, so it is the one that stays. */
export const casesToSave = (reviewed: ReviewedRow[], choiceOf: (row: ReviewedRow) => DuplicateChoice): BackupCase[] =>
  reviewed.flatMap((r) => (r.plan && (!r.duplicate || choiceOf(r) === 'replace') ? [r.plan] : []))

/** The sector as it would stand after saving: the cases it holds, with the saved ones in their place. */
export function sectorAfter(existing: BackupCase[], saved: BackupCase[], options: ModelOptions) {
  const byId = new Map([...existing, ...saved].map((c) => [c.id, c]))
  return summarize([...byId.values()], () => 'all', options).total
}

export const savedTotals = (saved: BackupCase[], options: ModelOptions) => {
  // a main pasted twice is saved once: the last of its rows
  const last = new Map(saved.map((c) => [c.id, c]))
  return summarize([...last.values()], () => 'all', options).total
}
