import { useMemo, useState } from 'react'
import { parseRows, splitRows } from './backup/bulkParse'
import { casesToSave, reviewRows, savedTotals, sectorAfter, type DuplicateChoice, type ReviewedRow } from './backup/bulkReview'
import type { StationDirectory } from './backup/directory'
import type { BackupCase, ModelOptions } from './backup/model'
import { readSheetBytes, rowsToText, type SheetFile } from './backup/sheetFile'
import { sectorBox } from './backup/stationReview'
import { MAX_FILE_BYTES, SheetFileError, type WorkbookSheet } from './backup/xlsxRead'
import type { LatLng } from './types'
import { useStationRows } from './useStationRows'

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

/** An Excel workbook or a delimited text file; a file too large is turned away before it is read. */
export async function readSheetFile(file: File): Promise<SheetFile> {
  if (file.size > MAX_FILE_BYTES) throw new SheetFileError('tooBig')
  return readSheetBytes(new Uint8Array(await file.arrayBuffer()))
}

interface Book {
  sheets: WorkbookSheet[]
  chosen: number
  /** The workbook's stations sheet, when it has one: stations typed there come along with the plans. */
  stations: WorkbookSheet | null
}

/** Pasted rows, or the rows of a file, on their way to the sector's plans: read, checked, and only then saved. Reads nothing. */
export function useBulkEntry(existing: BackupCase[], directory: StationDirectory, options: ModelOptions, sector: { id: string; center: LatLng }) {
  const [text, setText] = useState('')
  // the rows the preview was made from; `null` while they are still being pasted
  const [checked, setChecked] = useState<string[][] | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [choices, setChoices] = useState<ReadonlyMap<number, DuplicateChoice>>(new Map())
  const box = useMemo(() => sectorBox(sector.center, directory), [sector.center, directory])
  const stations = useStationRows(book?.stations?.rows ?? null, directory, box, sector.id)

  // ids are made once per check, so choosing replace or skip does not reshuffle them
  const reviewed = useMemo(
    () => (checked === null ? [] : reviewRows(parseRows(checked).rows, { existing, directory, options, newId, pins: stations.pins })),
    [checked, existing, directory, options, stations.pins],
  )
  const choiceOf = (row: ReviewedRow): DuplicateChoice => choices.get(row.row.line) ?? 'skip'
  const toSave = casesToSave(reviewed, choiceOf)

  const show = (rows: string[][]) => {
    setChoices(new Map())
    setChecked(rows)
  }
  // the sheet also goes into the box, as a paste of it would: "back" finds it there to correct
  const showSheet = (opened: Book) => {
    const rows = opened.sheets[opened.chosen]?.rows ?? []
    setBook(opened)
    setText(rowsToText(rows))
    show(rows)
  }

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
    /** The stations sheet of the workbook, reviewed: new and changed stations are written before the plans. */
    stations,
    /** The sheets of the workbook the preview shows; `null` for pasted rows and text files. */
    book,
    check: (from = text) => {
      setBook(null)
      show(splitRows(from))
    },
    checkFile: (file: SheetFile) => {
      if (file.kind === 'book') return showSheet({ sheets: file.sheets, chosen: file.chosen, stations: file.stationSheets[0] ?? null })
      setBook(null)
      setText(file.text)
      show(splitRows(file.text))
    },
    pickSheet: (chosen: number) => book && showSheet({ ...book, chosen }),
    back: () => setChecked(null),
    choose: (line: number, choice: DuplicateChoice) => setChoices((current) => new Map(current).set(line, choice)),
    chooseAll: (choice: DuplicateChoice) => setChoices(new Map(reviewed.filter((r) => r.duplicate).map((r) => [r.row.line, choice]))),
  }
}

export type BulkEntry = ReturnType<typeof useBulkEntry>
