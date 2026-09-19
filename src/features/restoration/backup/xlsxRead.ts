import { unzipSync } from 'fflate'
import { scanXml } from './xmlScan'

// The cells of an Excel workbook (.xlsx) as text, sheet by sheet. A workbook is
// a zip of XML parts: the workbook names its sheets, a relations part says which
// file holds each, and most text sits once in a shared list. Only values are
// read — a formula gives the result Excel last saved with it. Pure — no I/O.

export type SheetFileFailure =
  /** Larger than the entry reads. */
  | 'tooBig'
  | 'tooManyRows'
  /** An older or protected workbook: Excel can save it again as `.xlsx`. */
  | 'saveAs'
  /** Not a table at all. */
  | 'notSheet'

export class SheetFileError extends Error {
  reason: SheetFileFailure

  constructor(reason: SheetFileFailure, cause?: unknown) {
    super(`sheet file: ${reason}`, { cause })
    this.reason = reason
  }
}

export interface WorkbookSheet {
  name: string
  /** `rows[r][c]`, row 1 of the sheet first; blank rows stay, so a row keeps its number. */
  rows: string[][]
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_SHEET_ROWS = 20_000
// a small archive can unpack to a very large part
const MAX_PART_BYTES = 80 * 1024 * 1024
const MAX_COLUMNS = 512

export const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
/** The container of the older `.xls`, and of a workbook locked with a password. */
export const isOldOffice = (bytes: Uint8Array) => [0xd0, 0xcf, 0x11, 0xe0].every((byte, i) => bytes[i] === byte)

const decode = (bytes: Uint8Array) => {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null
  return new TextDecoder(utf16 ?? 'utf-8').decode(bytes).replace(/^\uFEFF/, '')
}

/** `worksheets/sheet1.xml` next to `xl/workbook.xml` → `xl/worksheets/sheet1.xml`. */
function resolve(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

const relsOf = (path: string) => {
  const cut = path.lastIndexOf('/') + 1
  return `${path.slice(0, cut)}_rels/${path.slice(cut)}.rels`
}

interface Relation {
  id: string
  type: string
  path: string
}

function relations(xml: string | undefined, from: string): Relation[] {
  const found: Relation[] = []
  if (!xml) return found
  scanXml(xml, {
    open: (name, a) => {
      if (name === 'Relationship' && a.Target && a.TargetMode !== 'External') found.push({ id: a.Id ?? '', type: a.Type ?? '', path: resolve(from, a.Target) })
    },
  })
  return found
}

// Excel writes characters XML cannot hold as _x000D_
const unescapeCell = (text: string) => (text.includes('_x') ? text.replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))) : text)

/** The shared texts in order; a text written in several formatted runs is joined. */
function sharedStrings(xml: string): string[] {
  const strings: string[] = []
  let current = ''
  let inText = false
  let phonetic = 0
  scanXml(xml, {
    open: (name) => {
      if (name === 'si') current = ''
      else if (name === 'rPh') phonetic += 1
      else if (name === 't') inText = phonetic === 0
    },
    close: (name) => {
      if (name === 'si') strings.push(unescapeCell(current))
      else if (name === 'rPh') phonetic -= 1
      else if (name === 't') inText = false
    },
    text: (text) => {
      if (inText) current += text
    },
  })
  return strings
}

/** `C5` → 2. */
const columnOfRef = (ref: string): number | null => {
  const letters = /^\$?([A-Za-z]{1,3})/.exec(ref)?.[1]
  if (!letters) return null
  let column = 0
  for (const letter of letters.toUpperCase()) column = column * 26 + (letter.charCodeAt(0) - 64)
  return column - 1
}

// 13.8 may be stored as 13.800000000000001: fifteen digits is what Excel itself shows
const numberText = (stored: string) => {
  const value = Number(stored)
  return stored.trim() !== '' && Number.isFinite(value) ? String(Number(value.toPrecision(15))) : stored.trim()
}

function sheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = []
  let rowNo = 0
  let column = -1
  let type = 'n'
  let value = ''
  let capture = false
  let inline = false
  let phonetic = 0

  scanXml(xml, {
    open: (name, a) => {
      if (name === 'row') {
        const given = Number(a.r)
        rowNo = Number.isInteger(given) && given > 0 ? given : rowNo + 1
        column = -1
      } else if (name === 'c') {
        // the reference places the cell: blank cells before it are simply not written
        column = (a.r ? columnOfRef(a.r) : null) ?? column + 1
        type = a.t ?? 'n'
        value = ''
      } else if (name === 'v') capture = true
      else if (name === 'is') inline = true
      else if (name === 'rPh') phonetic += 1
      else if (name === 't') capture = inline && phonetic === 0
    },
    close: (name) => {
      if (name === 'v' || name === 't') capture = false
      else if (name === 'is') inline = false
      else if (name === 'rPh') phonetic -= 1
      else if (name === 'c') {
        const text = (
          type === 's' ? (strings[Number(value)] ?? '') : type === 'n' ? numberText(value) : type === 'b' ? (value.trim() === '1' ? 'TRUE' : 'FALSE') : unescapeCell(value)
        ).trim()
        if (!text || column >= MAX_COLUMNS) return
        if (rowNo > MAX_SHEET_ROWS) throw new SheetFileError('tooManyRows')
        const row = (rows[rowNo - 1] ??= [])
        row[column] = text
      }
    },
    text: (text) => {
      if (capture) value += text
    },
  })
  // the gaps of a sparse sheet become blank cells and blank rows
  return Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? ''))
}

const endsWith = (type: string, kind: string) => type.toLowerCase().endsWith(`/${kind.toLowerCase()}`)

/** Every visible worksheet that holds something, in the order of the tabs. */
export function readWorkbook(bytes: Uint8Array): WorkbookSheet[] {
  if (bytes.length > MAX_FILE_BYTES) throw new SheetFileError('tooBig')
  if (isOldOffice(bytes)) throw new SheetFileError('saveAs')
  if (!isZip(bytes)) throw new SheetFileError('notSheet')

  const names: string[] = []
  const unzip = (wanted: (name: string) => boolean): Map<string, string> => {
    let parts: Record<string, Uint8Array>
    try {
      parts = unzipSync(bytes, {
        filter: (entry) => {
          names.push(entry.name)
          if (!wanted(entry.name.toLowerCase())) return false
          if (entry.originalSize > MAX_PART_BYTES) throw new SheetFileError('tooBig')
          return true
        },
      })
    } catch (error) {
      throw error instanceof SheetFileError ? error : new SheetFileError('saveAs', error)
    }
    // some writers do not keep the letter case the relations use
    return new Map(Object.entries(parts).map(([name, part]) => [name.toLowerCase(), decode(part)]))
  }

  try {
    const index = unzip((name) => name.endsWith('.rels') || name === '[content_types].xml')
    const workbookPath = relations(index.get('_rels/.rels'), '').find((r) => endsWith(r.type, 'officeDocument'))?.path ?? 'xl/workbook.xml'
    const related = relations(index.get(relsOf(workbookPath).toLowerCase()), workbookPath)
    if (related.length === 0) throw new SheetFileError(names.some((name) => /workbook\.bin$/i.test(name)) ? 'saveAs' : 'notSheet')
    if (/macroenabled/i.test(index.get('[content_types].xml') ?? '')) throw new SheetFileError('saveAs')

    const sheetPaths = new Map(related.filter((r) => endsWith(r.type, 'worksheet')).map((r) => [r.id, r.path.toLowerCase()]))
    const stringsPath = related.find((r) => endsWith(r.type, 'sharedStrings'))?.path.toLowerCase()
    const wanted = new Set([workbookPath.toLowerCase(), ...sheetPaths.values(), ...(stringsPath ? [stringsPath] : [])])
    const parts = unzip((name) => wanted.has(name))

    const workbook = parts.get(workbookPath.toLowerCase())
    if (!workbook) throw new SheetFileError('notSheet')
    const listed: { name: string; path: string; hidden: boolean }[] = []
    scanXml(workbook, {
      open: (name, a) => {
        if (name !== 'sheet') return
        const relation = Object.entries(a).find(([key]) => key.endsWith(':id'))?.[1]
        const path = relation ? sheetPaths.get(relation) : undefined
        if (path) listed.push({ name: a.name ?? '', path, hidden: Boolean(a.state && a.state !== 'visible') })
      },
    })
    // hidden sheets are somebody's workings, unless the workbook shows nothing else
    const shown = listed.some((sheet) => !sheet.hidden) ? listed.filter((sheet) => !sheet.hidden) : listed

    const strings = sharedStrings((stringsPath && parts.get(stringsPath)) || '')
    return shown.flatMap(({ name, path }) => {
      const xml = parts.get(path)
      const rows = xml ? sheetRows(xml, strings) : []
      return rows.length > 0 ? [{ name, rows }] : []
    })
  } catch (error) {
    // a part that breaks off half-way: the file did not arrive whole
    throw error instanceof SheetFileError ? error : new SheetFileError('saveAs', error)
  }
}
