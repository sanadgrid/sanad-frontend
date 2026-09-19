import { normalizeQuery } from '../import/stations'
import type { BackupLevel } from './model'

// Rows copied out of a spreadsheet (tab-separated) or a CSV file, read into plan
// lines: main element and its load, then backups and their loads in pairs. A
// header row is optional; with one, the columns may come in any order and may
// include the level, the voltage, the rating and a note. Pure — no I/O.

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
  /** The line of the pasted text, from 1, header included. */
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
const DERIVED = /spare|transfer|final|loading|pct|mva|restor|ratio|status|derat|total|متاح|تحويل|نسبة/

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

/**
 * A figure as people type it: Arabic-Indic digits, "1,250" or "1٬250" for
 * thousands, "٫" for the decimal point. `null` for anything that is not a number ≥ 0.
 */
export function figureOf(text: string): number | null {
  const plain = normalizeQuery(text).replace(/\s/g, '').replace('٫', '.')
  const grouped = /^\d{1,3}([,٬]\d{3})+(\.\d+)?$/.test(plain) ? plain.replace(/[,٬]/g, '') : plain
  if (!/^\d+(\.\d+)?$/.test(grouped)) return null
  return Number(grouped)
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

export function parseSheet(text: string): ParsedSheet {
  const lines = splitCells(text, delimiterOf(text)).map((cells) => cells.map((cell) => cell.trim()))
  const firstUsed = lines.findIndex((cells) => cells.some(Boolean))
  if (firstUsed < 0) return { rows: [], hadHeader: false }
  const named = lines[firstUsed].map(columnOf)
  const hadHeader = named.some((column) => column?.kind === 'main')
  const width = Math.max(...lines.map((cells) => cells.length))
  const columns = hadHeader ? named : positional(width)

  const rows: ParsedRow[] = []
  lines.forEach((cells, index) => {
    if (index < firstUsed || (hadHeader && index === firstUsed) || !cells.some(Boolean)) return
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
