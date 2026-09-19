import { normalizeQuery } from '../import/stations'
import { figureOf } from './figure'
import type { BackupLevel } from './model'

// Rows copied out of a spreadsheet (tab-separated), a CSV file or the cells of a
// workbook, read into plan lines: main element and its load, then backups and
// their loads in pairs. A header row is optional; with one, the columns may come
// in any order and may include the level, the voltage, the rating and a note.
// Title lines above the header are left out. Pure — no I/O.

// the forms of the page read figures too, and should not bring the sheet reader with them
export { figureOf }

export type ParseProblem =
  | { kind: 'noMain' }
  | { kind: 'badMainLoad' }
  /** `order`: 0 = first backup. */
  | { kind: 'badBackupLoad'; order: number }
  | { kind: 'backupWithoutNo'; order: number }
  | { kind: 'badLevel' }
  | { kind: 'badVoltage' }
  | { kind: 'badRating' }

export interface ParsedRow {
  /** The line of the pasted text or the row of the sheet, from 1, header included. */
  line: number
  main: { no: string; loadA: number }
  backups: { no: string; loadA: number }[]
  level?: BackupLevel
  voltageKv?: number
  ratingA?: number
  note?: string
  demo?: boolean
  problems: ParseProblem[]
}

export interface ParsedSheet {
  rows: ParsedRow[]
  hadHeader: boolean
}

type Column = { kind: 'main' | 'mainLoad' | 'level' | 'voltage' | 'rating' | 'note' | 'demo' } | { kind: 'backup' | 'backupLoad'; order: number }

const ORDINALS: [RegExp, string][] = [
  [/الأول|الاول|first/, '1'],
  [/الثاني|second/, '2'],
  [/الثالث|third/, '3'],
  [/الرابع|fourth/, '4'],
  [/الخامس|fifth/, '5'],
]
// columns of the dashboard's own export that are results, not input
const DERIVED = /spare|transfer|final|loading|pct|mva|restor|ratio|status|derat|total|متاح|تحويل|نسبة|معتمد|استعاد/

/** What a header cell names, or `null` for a column the entry does not use. */
export function columnOf(header: string): Column | null {
  let h = normalizeQuery(header).replace(/[\s_\-–.()[\]:ـ]+/g, ' ')
  for (const [word, digit] of ORDINALS) h = h.replace(word, ` ${digit} `)
  if (!h.trim() || DERIVED.test(h)) return null
  const order = Number(/\d+/.exec(h)?.[0] ?? 0) - 1
  const isLoad = /حمل|load|أمبير|امبير|amp/.test(h)
  if (/رئيس|main/.test(h)) return { kind: isLoad ? 'mainLoad' : 'main' }
  if (/بديل|بدائل|backup|^b ?\d/.test(h) || (isLoad && order >= 0)) return order >= 0 ? { kind: isLoad ? 'backupLoad' : 'backup', order } : null
  if (/مستوى|level/.test(h)) return { kind: 'level' }
  if (/جهد|voltage|\bkv\b/.test(h)) return { kind: 'voltage' }
  if (/سعة|قاطع|rating|breaker/.test(h)) return { kind: 'rating' }
  if (/ملاحظ|note|remark/.test(h)) return { kind: 'note' }
  if (/تجريبي|demo/.test(h)) return { kind: 'demo' }
  return null
}

/** Cells of delimited text; a quoted cell may hold the delimiter, a line break and doubled quotes. */
export function splitCells(text: string, delimiter: string): string[][] {
  const lines: string[][] = [[]]
  let cell = ''
  let quoted = false
  const clean = text.replace(/^﻿/, '')
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i]
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) {
      lines[lines.length - 1].push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i += 1
      lines[lines.length - 1].push(cell)
      cell = ''
      lines.push([])
    } else cell += c
  }
  lines[lines.length - 1].push(cell)
  return lines
}

// a tab anywhere means a paste from a spreadsheet; a file says by its first line
const delimiterOf = (text: string) => {
  if (text.includes('\t')) return '\t'
  const first = text.split(/\r?\n/, 1)[0]
  return first.split(';').length > first.split(',').length ? ';' : ','
}

const LEVELS: [RegExp, BackupLevel][] = [
  [/^(محطة|محطه|station|s\/s|ss)$/, 'station'],
  [/^(مغذي|مغذى|feeder|f)$/, 'feeder'],
]
const YES = /^(yes|y|true|1|نعم|تجريبي)$/

const positional = (width: number): (Column | null)[] =>
  Array.from({ length: width }, (_, i): Column => {
    if (i === 0) return { kind: 'main' }
    if (i === 1) return { kind: 'mainLoad' }
    return { kind: i % 2 === 0 ? 'backup' : 'backupLoad', order: Math.floor((i - 2) / 2) }
  })

// how far down a sheet the header may sit under its titles
const HEADER_SEARCH = 25
const looksLikeData = (cells: string[]) => Boolean(cells[0]) && figureOf(cells[1] ?? '') !== null
const isTitle = (cells: string[]) => cells.filter(Boolean).length < 2 && cells.every((cell) => figureOf(cell) === null)

/** The header row (or -1) and the first row read as a plan: titles above them belong to neither. */
function startOf(lines: string[][]): { header: number; first: number } {
  let seen = 0
  for (let i = 0; i < lines.length && seen < HEADER_SEARCH; i += 1) {
    if (!lines[i].some(Boolean)) continue
    const kinds = lines[i].map((cell) => columnOf(cell)?.kind)
    // under other lines, a note that says "main" is not enough to make a header
    if (kinds.includes('main') && (seen === 0 || kinds.includes('mainLoad'))) return { header: i, first: i + 1 }
    if (looksLikeData(lines[i])) break
    seen += 1
  }
  const first = lines.findIndex((cells) => cells.some(Boolean) && !isTitle(cells))
  return { header: -1, first: first < 0 ? lines.findIndex((cells) => cells.some(Boolean)) : first }
}

/** Pasted or delimited text as rows of cells, the delimiter told from the text itself. */
export const splitRows = (text: string): string[][] => splitCells(text, delimiterOf(text))

export const parseSheet = (text: string): ParsedSheet => parseRows(splitRows(text))

/** `matrix[r][c]` is the cell as text; rows may be ragged, and blank ones keep the numbering. */
export function parseRows(matrix: readonly (readonly string[])[]): ParsedSheet {
  const lines = matrix.map((cells) => cells.map((cell) => cell.trim()))
  const { header, first } = startOf(lines)
  if (first < 0) return { rows: [], hadHeader: false }
  const hadHeader = header >= 0
  const width = Math.max(0, ...lines.slice(first).map((cells) => cells.length))
  const columns = hadHeader ? lines[header].map(columnOf) : positional(width)

  const rows: ParsedRow[] = []
  lines.forEach((cells, index) => {
    if (index < first || !cells.some(Boolean)) return
    const row: ParsedRow = { line: index + 1, main: { no: '', loadA: 0 }, backups: [], problems: [] }
    const pairs = new Map<number, { no: string; load: string }>()
    const pair = (order: number) => {
      const known = pairs.get(order)
      if (known) return known
      const made = { no: '', load: '' }
      pairs.set(order, made)
      return made
    }

    cells.forEach((cell, i) => {
      const column = columns[i]
      if (!column || !cell) return
      if (column.kind === 'main') row.main.no = normalizeQuery(cell)
      else if (column.kind === 'mainLoad') {
        const loadA = figureOf(cell)
        if (loadA === null) row.problems.push({ kind: 'badMainLoad' })
        else row.main.loadA = loadA
      } else if (column.kind === 'backup') pair(column.order).no = normalizeQuery(cell)
      else if (column.kind === 'backupLoad') pair(column.order).load = cell
      else if (column.kind === 'level') {
        const level = LEVELS.find(([pattern]) => pattern.test(normalizeQuery(cell)))?.[1]
        if (level) row.level = level
        else row.problems.push({ kind: 'badLevel' })
      } else if (column.kind === 'voltage') {
        const kv = figureOf(cell.replace(/kv|ك\.?ف/i, ''))
        if (kv) row.voltageKv = kv
        else row.problems.push({ kind: 'badVoltage' })
      } else if (column.kind === 'rating') {
        const ratingA = figureOf(cell)
        if (ratingA) row.ratingA = ratingA
        else row.problems.push({ kind: 'badRating' })
      } else if (column.kind === 'note') row.note = cell
      else if (YES.test(normalizeQuery(cell))) row.demo = true
    })

    if (!row.main.no) row.problems.push({ kind: 'noMain' })
    const mainLoadAt = columns.findIndex((column) => column?.kind === 'mainLoad')
    if (row.main.no && !cells[mainLoadAt] && !row.problems.some((p) => p.kind === 'badMainLoad')) row.problems.push({ kind: 'badMainLoad' })

    // blank pairs are lines not used, as in the sheet: the backups that follow move up
    for (const order of [...pairs.keys()].sort((a, b) => a - b)) {
      const { no, load } = pair(order)
      const loadA = figureOf(load)
      if (!no && load) row.problems.push({ kind: 'backupWithoutNo', order })
      else if (no && loadA === null) row.problems.push({ kind: 'badBackupLoad', order })
      else if (no && loadA !== null) row.backups.push({ no, loadA })
    }
    rows.push(row)
  })
  return { rows, hadHeader }
}
