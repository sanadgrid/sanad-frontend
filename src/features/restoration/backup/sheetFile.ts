import { parseRows } from './bulkParse'
import { isStationSheet } from './stationParse'
import { isOldOffice, isZip, MAX_FILE_BYTES, readWorkbook, SheetFileError, type WorkbookSheet } from './xlsxRead'

// A chosen or dropped file on its way to the entry: an Excel workbook gives its
// sheets, anything else is read as delimited text. What a file is shows in its
// first bytes, whatever it is called. Pure — no I/O.

export type SheetFile =
  | { kind: 'text'; text: string }
  /** `sheets` may hold plans; `stationSheets` list stations, and are kept apart from them. */
  | { kind: 'book'; sheets: WorkbookSheet[]; chosen: number; stationSheets: WorkbookSheet[] }

const utf16Of = (bytes: Uint8Array) => (bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null)

/** A spreadsheet saved as CSV is UTF-8, UTF-16 ("Unicode text") or, from an older Arabic Windows, its own code page. */
function decodeText(bytes: Uint8Array): string {
  const utf16 = utf16Of(bytes)
  if (utf16) return new TextDecoder(utf16).decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1256').decode(bytes)
  }
}

// a page or a document dressed as a sheet, and anything with bytes no text holds
const notText = (bytes: Uint8Array, text: string) => (!utf16Of(bytes) && bytes.subarray(0, 4096).includes(0)) ||/^\s*(<[!?a-z]|%PDF|\{\\rtf)/i.test(text.slice(0, 200))

/** A sheet that can hold plans has a row of at least two cells: a page of notes does not. */
const canHoldPlans = (sheet: WorkbookSheet) => sheet.rows.some((row) => row.filter(Boolean).length > 1)

/** The first sheet with a row the entry can save; failing that, the first one. */
export const bestSheet = (sheets: WorkbookSheet[]) =>
  Math.max(
    0,
    sheets.findIndex((sheet) => parseRows(sheet.rows).rows.some((row) => row.problems.length === 0)),
  )

export function readSheetBytes(bytes: Uint8Array): SheetFile {
  if (bytes.length > MAX_FILE_BYTES) throw new SheetFileError('tooBig')
  if (isZip(bytes) || isOldOffice(bytes)) {
    const all = readWorkbook(bytes)
    const stationSheets = all.filter(isStationSheet)
    const rest = all.filter((sheet) => !stationSheets.includes(sheet))
    const sheets = rest.some(canHoldPlans) ? rest.filter(canHoldPlans) : rest
    return { kind: 'book', sheets, chosen: bestSheet(sheets), stationSheets }
  }
  const text = decodeText(bytes)
  if (bytes.length > 0 && notText(bytes, text)) throw new SheetFileError(/^\s*</.test(text.slice(0, 200)) ? 'saveAs' : 'notSheet')
  return { kind: 'text', text }
}

/** Rows as the text a paste would give, so a sheet that was read can be corrected in the box. */
export const rowsToText = (rows: string[][]) =>
  rows.map((cells) => cells.map((cell) => (/[",;\t\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)).join('\t')).join('\n')
