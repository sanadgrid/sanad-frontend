import { useState } from 'react'
import { splitRows } from './backup/bulkParse'
import type { StationDirectory } from './backup/directory'
import { rowsToText, type SheetFile } from './backup/sheetFile'
import type { StationBox } from './backup/stationReview'
import type { WorkbookSheet } from './backup/xlsxRead'
import { useStationRows } from './useStationRows'

interface Book {
  sheets: WorkbookSheet[]
  chosen: number
}

/** Pasted rows, or the rows of a file, on their way to the sector's stations: read, checked, and only then saved. Reads nothing. */
export function useStationImport(directory: StationDirectory, box: StationBox, sectorId: string) {
  const [text, setText] = useState('')
  // the rows the preview was made from; `null` while they are still being pasted
  const [checked, setChecked] = useState<string[][] | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const rows = useStationRows(checked, directory, box, sectorId)

  // the sheet also goes into the box, as a paste of it would: "back" finds it there to correct
  const showSheet = (opened: Book) => {
    const cells = opened.sheets[opened.chosen]?.rows ?? []
    setBook(opened)
    setText(rowsToText(cells))
    setChecked(cells)
  }

  return {
    ...rows,
    text,
    setText,
    previewing: checked !== null,
    /** The sheets of the workbook the preview shows; `null` for pasted rows and text files. */
    book,
    check: (from = text) => {
      setBook(null)
      setChecked(splitRows(from))
    },
    checkFile: (file: SheetFile) => {
      if (file.kind === 'book') {
        // a workbook that lists stations somewhere is read there; any other from its first sheet
        const sheets = file.stationSheets.length > 0 ? file.stationSheets : file.sheets
        return showSheet({ sheets, chosen: 0 })
      }
      setBook(null)
      setText(file.text)
      setChecked(splitRows(file.text))
    },
    pickSheet: (chosen: number) => book && showSheet({ ...book, chosen }),
    back: () => setChecked(null),
  }
}

export type StationImport = ReturnType<typeof useStationImport>
