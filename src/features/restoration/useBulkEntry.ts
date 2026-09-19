import { useMemo, useState } from 'react'
import { parseSheet } from './backup/bulkParse'
import { casesToSave, reviewRows, savedTotals, sectorAfter, type DuplicateChoice, type ReviewedRow } from './backup/bulkReview'
import type { StationDirectory } from './backup/directory'
import type { BackupCase, ModelOptions } from './backup/model'

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

/** A spreadsheet saved as CSV is UTF-8 or, from an older Arabic Windows, its own code page. */
export async function readSheetFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1256').decode(bytes)
  }
}

/** Pasted rows on their way to the sector's plans: read, checked, and only then saved. Reads nothing. */
export function useBulkEntry(existing: BackupCase[], directory: StationDirectory, options: ModelOptions) {
  const [text, setText] = useState('')
  // the text the preview was made from; `null` while it is still being pasted
  const [checked, setChecked] = useState<string | null>(null)
  const [choices, setChoices] = useState<ReadonlyMap<number, DuplicateChoice>>(new Map())

  // ids are made once per check, so choosing replace or skip does not reshuffle them
  const reviewed = useMemo(
    () => (checked === null ? [] : reviewRows(parseSheet(checked).rows, { existing, directory, options, newId })),
    [checked, existing, directory, options],
  )
  const choiceOf = (row: ReviewedRow): DuplicateChoice => choices.get(row.row.line) ?? 'skip'
  const toSave = casesToSave(reviewed, choiceOf)

  return {
    text,
    setText,
    previewing: checked !== null,
    reviewed,
    choiceOf,
    toSave,
    totals: savedTotals(toSave, options),
    after: sectorAfter(existing, toSave, options),
    counts: {
      invalid: reviewed.filter((r) => !r.plan).length,
      duplicates: reviewed.filter((r) => r.duplicate).length,
      flagged: reviewed.filter((r) => r.plan && (r.notFound.length > 0 || r.ambiguous.length > 0)).length,
    },
    check: (from = text) => {
      setChoices(new Map())
      setChecked(from)
    },
    back: () => setChecked(null),
    choose: (line: number, choice: DuplicateChoice) => setChoices((current) => new Map(current).set(line, choice)),
    chooseAll: (choice: DuplicateChoice) => setChoices(new Map(reviewed.filter((r) => r.duplicate).map((r) => [r.row.line, choice]))),
  }
}

export type BulkEntry = ReturnType<typeof useBulkEntry>
