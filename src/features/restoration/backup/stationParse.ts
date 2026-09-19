import { normalizeQuery, stationNoOf } from '../import/stations'
import { STATIONS_SHEET } from './stationSheet'
import type { WorkbookSheet } from './xlsxRead'

// Rows of a stations sheet — pasted, from a CSV, or the cells of a workbook —
// read into stations: number, FLOCSAP, name, latitude, longitude and the layer
// they belong in. A header row names the columns in any order, in Arabic or
// English; without one, the first four columns are number, name, latitude and
// longitude. Pure — no I/O.

export type StationColumn = 'no' | 'floc' | 'name' | 'lat' | 'lng' | 'layer'

export type StationProblem = 'noNumber' | 'badNumber' | 'noCoords' | 'badCoords'

export interface ParsedStation {
  /** The row of the sheet, from 1, header included. */
  line: number
  no: string
  floc?: string
  name: string
  layer: string
  lat: number | null
  lng: number | null
  problem: StationProblem | null
}

export interface ParsedStations {
  rows: ParsedStation[]
  hadHeader: boolean
}

export const MAX_FLOC_LENGTH = 40
// how far down a sheet the header may sit under its titles
const HEADER_SEARCH = 25

/** What a header cell names, or `null` for a column the import does not use. */
export function stationColumnOf(header: string): StationColumn | null {
  const h = normalizeQuery(header).replace(/[\s_\-–.()[\]:ـ]+/g, ' ').trim()
  if (!h) return null
  if (/floc|functional location|الموقع الوظيفي|sap/.test(h)) return 'floc'
  if (/عرض|\blat/.test(h)) return 'lat'
  if (/طول|\blng|\blon/.test(h)) return 'lng'
  if (/طبق|layer|folder|مجلد/.test(h)) return 'layer'
  if (/اسم|name/.test(h)) return 'name'
  if (/رقم|number|\bno\b|^id$|محطة|station/.test(h)) return 'no'
  return null
}

const POSITIONAL: StationColumn[] = ['no', 'name', 'lat', 'lng', 'layer']

/** A latitude or longitude as people type it: a decimal point or comma, Arabic digits, a stray degree sign. */
export function coordinateOf(text: string): number | null {
  const plain = normalizeQuery(text).replace(/[\s°]/g, '').replace('٫', '.').replace(/^\+/, '')
  const dotted = /^-?\d+,\d+$/.test(plain) ? plain.replace(',', '.') : plain
  return /^-?\d+(\.\d+)?$/.test(dotted) ? Number(dotted) : null
}

/** The FLOCSAP as stored: trimmed, at most 40 characters, never a number. */
export const flocOf = (text: string) => text.trim().slice(0, MAX_FLOC_LENGTH)

const kindsOf = (cells: string[]) => cells.map(stationColumnOf)
const isHeader = (kinds: (StationColumn | null)[]) => kinds.includes('no') && (kinds.includes('lat') || kinds.includes('lng'))

/** The header row, or -1 when the sheet has none in its first lines. */
function headerOf(lines: string[][]): number {
  let seen = 0
  for (let i = 0; i < lines.length && seen < HEADER_SEARCH; i += 1) {
    if (!lines[i].some(Boolean)) continue
    if (isHeader(kindsOf(lines[i]))) return i
    seen += 1
  }
  return -1
}

/** A sheet that lists stations: named so, or headed with a number and coordinates. */
export const isStationSheet = (sheet: WorkbookSheet) =>
  new RegExp(`^(${STATIONS_SHEET}|stations?)$`, 'i').test(sheet.name.trim()) || headerOf(sheet.rows.map((cells) => cells.map((cell) => cell.trim()))) >= 0

/** `matrix[r][c]` is the cell as text; rows may be ragged, and blank ones keep the numbering. */
export function parseStationRows(matrix: readonly (readonly string[])[]): ParsedStations {
  const lines = matrix.map((cells) => cells.map((cell) => cell.trim()))
  const header = headerOf(lines)
  const columns: (StationColumn | null)[] = header >= 0 ? kindsOf(lines[header]) : POSITIONAL
  const rows: ParsedStation[] = []
  lines.forEach((cells, index) => {
    if (index <= header || !cells.some(Boolean)) return
    const row: ParsedStation = { line: index + 1, no: '', name: '', layer: '', lat: null, lng: null, problem: null }
    let latText = ''
    let lngText = ''
    cells.forEach((cell, i) => {
      const column = columns[i]
      if (!column || !cell) return
      if (column === 'no') row.no = normalizeQuery(cell)
      else if (column === 'floc') row.floc = flocOf(cell)
      else if (column === 'name') row.name = cell
      else if (column === 'layer') row.layer = cell
      else if (column === 'lat') latText = cell
      else lngText = cell
    })
    // "S/S 7001" names its number too; a number of any other length is not a station's
    const no = stationNoOf(row.no) ?? (/^[1-9]\d{3}$/.test(row.no) ? row.no : null)
    if (!row.no) row.problem = 'noNumber'
    else if (!no) row.problem = 'badNumber'
    row.no = no ?? row.no
    if (!row.floc) delete row.floc
    row.lat = coordinateOf(latText)
    row.lng = coordinateOf(lngText)
    if (!row.problem && (row.lat === null || row.lng === null)) row.problem = latText || lngText ? 'badCoords' : 'noCoords'
    rows.push(row)
  })
  return { rows, hadHeader: header >= 0 }
}
