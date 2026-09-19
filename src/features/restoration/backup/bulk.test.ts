import { describe, expect, it } from 'vitest'
import { columnOf, figureOf, parseSheet, splitCells } from './bulkParse'
import { bulkTemplate, casesToSave, reviewRows, savedTotals, sectorAfter } from './bulkReview'
import { buildDirectory } from './directory'
import type { BackupCase } from './model'
import { plansToCsv } from './planCsv'

const tsv = (...lines: (string | number)[][]) => lines.map((cells) => cells.join('\t')).join('\n')

describe('figures as people type them', () => {
  it('Arabic-Indic digits, thousands separators and the Arabic decimal point', () => {
    expect(figureOf('٣٢٠')).toBe(320)
    expect(figureOf('1,250')).toBe(1250)
    expect(figureOf('١٬٢٥٠٫٥')).toBe(1250.5)
    expect(figureOf(' 1 250 ')).toBe(1250)
    expect(figureOf('13.8')).toBe(13.8)
    expect(figureOf('0')).toBe(0)
  })

  it('anything else is not a figure', () => {
    for (const text of ['', '-5', 'abc', '12a', '1,25', '1.2.3']) expect(figureOf(text)).toBeNull()
  })
})

describe('header cells', () => {
  it('Arabic and English names, with Arabic or Latin numbers and ordinals', () => {
    expect(columnOf('الرئيسي')).toEqual({ kind: 'main' })
    expect(columnOf('المحطة الرئيسية')).toEqual({ kind: 'main' })
    expect(columnOf('حمل الرئيسي')).toEqual({ kind: 'mainLoad' })
    expect(columnOf('بديل ١')).toEqual({ kind: 'backup', order: 0 })
    expect(columnOf('البديل الثاني')).toEqual({ kind: 'backup', order: 1 })
    expect(columnOf('حمل ٣')).toEqual({ kind: 'backupLoad', order: 2 })
    expect(columnOf('حمل البديل 4')).toEqual({ kind: 'backupLoad', order: 3 })
    expect(columnOf('Main')).toEqual({ kind: 'main' })
    expect(columnOf('main_load_a')).toEqual({ kind: 'mainLoad' })
    expect(columnOf('Backup 2')).toEqual({ kind: 'backup', order: 1 })
    expect(columnOf('backup2_load_a')).toEqual({ kind: 'backupLoad', order: 1 })
    expect(columnOf('Load 1')).toEqual({ kind: 'backupLoad', order: 0 })
    expect(columnOf('المستوى')).toEqual({ kind: 'level' })
    expect(columnOf('الجهد kV')).toEqual({ kind: 'voltage' })
    expect(columnOf('سعة القاطع')).toEqual({ kind: 'rating' })
    expect(columnOf('ملاحظات')).toEqual({ kind: 'note' })
  })

  it('leaves out the result columns of the dashboard\'s own file', () => {
    for (const name of ['backup1_spare_a', 'backup1_final_load_a', 'main_load_mva', 'ratio_pct', 'backups', 'derating', 'status', '']) expect(columnOf(name)).toBeNull()
  })
})

describe('pasted rows', () => {
  it('without a header: main, its load, then backups in pairs — more than three too', () => {
    const { rows, hadHeader } = parseSheet(tsv([7001, 320, 7002, 270, 7003, 285, 7004, 260, 7005, 250, 7006, 240]))
    expect(hadHeader).toBe(false)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ line: 1, main: { no: '7001', loadA: 320 }, problems: [] })
    expect(rows[0].backups.map((b) => [b.no, b.loadA])).toEqual([['7002', 270], ['7003', 285], ['7004', 260], ['7005', 250], ['7006', 240]])
  })

  it('an Arabic header, columns in any order, optional columns and Arabic digits', () => {
    const { rows, hadHeader } = parseSheet(
      tsv(['ملاحظة', 'المستوى', 'الجهد', 'الرئيسي', 'حمل الرئيسي', 'بديل ١', 'حمل ١', 'السعة'], ['صيفي', 'مغذي', '٣٣', '٧٠٠١/F2', '٣٢٠', '٧٠٠٢', '٢٧٠', '٦٠٠']),
    )
    expect(hadHeader).toBe(true)
    expect(rows[0]).toMatchObject({ line: 2, main: { no: '7001/f2', loadA: 320 }, level: 'feeder', voltageKv: 33, ratingA: 600, note: 'صيفي', problems: [] })
    expect(rows[0].backups).toEqual([{ no: '7002', loadA: 270 }])
  })

  it('an English header, in a comma file with quoted cells and a byte-order mark', () => {
    const csv = '﻿Main,Main load,Backup 1,Load 1,Backup 2,Load 2,Note\r\n7001,"1,250",7002,270,,,"a, b"\r\n'
    const { rows } = parseSheet(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ main: { no: '7001', loadA: 1250 }, note: 'a, b', problems: [] })
    expect(rows[0].backups).toEqual([{ no: '7002', loadA: 270 }])
  })

  it('a semicolon file, as a spreadsheet saves it where the comma is the decimal mark', () => {
    expect(parseSheet('7001;320;7002;270').rows[0].backups).toEqual([{ no: '7002', loadA: 270 }])
  })

  it('blank lines are skipped and blank pairs close up', () => {
    const { rows } = parseSheet(tsv([7001, 320, '', '', 7003, 285], [], ['', '', '', ''], [7004, 300]))
    expect(rows.map((r) => r.line)).toEqual([1, 4])
    expect(rows[0].backups).toEqual([{ no: '7003', loadA: 285 }])
    expect(rows[1]).toMatchObject({ main: { no: '7004', loadA: 300 }, backups: [], problems: [] })
  })

  it('bad rows say what is wrong with them', () => {
    const { rows } = parseSheet(tsv(['', 320, 7002, 270], [7001, 'abc', 7002, 270], [7001, '', 7002, 270], [7001, 320, 7002, ''], [7001, 320, '', 270], [7001, 320, 7002, 'x', 7003, 100]))
    expect(rows.map((r) => r.problems)).toEqual([
      [{ kind: 'noMain' }],
      [{ kind: 'badMainLoad' }],
      [{ kind: 'badMainLoad' }],
      [{ kind: 'badBackupLoad', order: 0 }],
      [{ kind: 'backupWithoutNo', order: 0 }],
      [{ kind: 'badBackupLoad', order: 0 }],
    ])
  })

  it('a level, a voltage or a rating that cannot be read', () => {
    const { rows } = parseSheet(tsv(['main', 'main load', 'level', 'voltage', 'rating'], [7001, 320, 'xyz', 'high', 'big'], [7002, 300, 'Station', '13.8 kV', '']))
    expect(rows[0].problems).toEqual([{ kind: 'badLevel' }, { kind: 'badVoltage' }, { kind: 'badRating' }])
    expect(rows[1]).toMatchObject({ level: 'station', voltageKv: 13.8, problems: [] })
    expect(rows[1].ratingA).toBeUndefined()
  })

  it('quoted cells keep their line breaks', () => {
    expect(splitCells('a,"b\nc",d\ne', ',')).toEqual([['a', 'b\nc', 'd'], ['e']])
  })

  it('nothing pasted, nothing read', () => {
    expect(parseSheet(' \n\t\n')).toEqual({ rows: [], hadHeader: false })
  })

  it('reads the template and the dashboard\'s own file back', () => {
    const template = parseSheet(bulkTemplate())
    expect(template.hadHeader).toBe(true)
    expect(template.rows.map((r) => [r.main.no, r.backups.length, r.level, r.problems.length])).toEqual([['7001', 3, 'station', 0], ['7005', 2, 'feeder', 0]])
    expect(template.rows[1].ratingA).toBe(400)

    const plan: BackupCase = { id: 'a', level: 'feeder', voltageKv: 33, main: { no: '7001', loadA: 320 }, backups: [{ no: '7002', loadA: 270 }, { no: '7003', loadA: 285 }], demo: true, note: 'n' }
    const [back] = parseSheet(plansToCsv([plan], { ratingA: 400 }, 0.87)).rows
    expect(back).toMatchObject({ main: { no: '7001', loadA: 320 }, level: 'feeder', voltageKv: 33, ratingA: 400, demo: true, note: 'n', problems: [] })
    expect(back.backups).toEqual([{ no: '7002', loadA: 270 }, { no: '7003', loadA: 285 }])
  })
})

describe('the check before saving', () => {
  const directory = buildDirectory([
    {
      id: 'layer-a',
      name: 'Zone A',
      stations: [
        { no: '7001', c: [46.1, 24.1] },
        { no: '7002', c: [46.2, 24.1] },
        { no: '7003', c: [46.3, 24.1] },
        { no: '7005', c: [46.5, 24.1] },
        { no: '7005', c: [46.5, 24.3] },
      ],
    },
  ])
  const existing: BackupCase[] = [{ id: 'old', level: 'station', voltageKv: 13.8, main: { no: '7003', loadA: 100 }, backups: [] }]
  let serial = 0
  const context = { existing, directory, options: { ratingA: 400 }, newId: () => `new-${(serial += 1)}` }
  const review = (text: string) => reviewRows(parseSheet(text).rows, context)

  it('one place: the element stands there; several: no point, flagged; none: flagged', () => {
    const [r] = review(tsv([7001, 320, 7002, 270, 7005, 100, 7999, 50]))
    expect(r.plan?.main).toEqual({ no: '7001', loadA: 320, at: [46.1, 24.1], layerId: 'layer-a' })
    expect(r.plan?.backups.map((b) => b.at)).toEqual([[46.2, 24.1], undefined, undefined])
    expect(r).toMatchObject({ ambiguous: ['7005'], notFound: ['7999'], duplicate: null })
    expect(r.result?.ratio).toBe(1)
  })

  it('a main that already has a plan takes that plan\'s place — or is skipped', () => {
    const rows = review(tsv([7003, 300, 7001, 200], [7002, 100, 7001, 200]))
    expect(rows.map((r) => [r.duplicate, r.plan?.id])).toEqual([['existing', 'old'], [null, expect.stringMatching(/^new-/)]])
    expect(casesToSave(rows, () => 'skip').map((c) => c.main.no)).toEqual(['7002'])
    expect(casesToSave(rows, () => 'replace').map((c) => c.id)).toEqual(['old', rows[1].plan?.id])
  })

  it('a main pasted twice: the later row replaces the earlier, under one id', () => {
    const rows = review(tsv([7001, 300, 7002, 200], [7001, 380, 7002, 390]))
    expect(rows.map((r) => r.duplicate)).toEqual([null, 'pasted'])
    expect(rows[1].plan?.id).toBe(rows[0].plan?.id)
    const saved = casesToSave(rows, () => 'replace')
    expect(savedTotals(saved, { ratingA: 400 })).toMatchObject({ count: 1, loadA: 380, unrestorableA: 370 })
    expect(savedTotals(casesToSave(rows, () => 'skip'), { ratingA: 400 })).toMatchObject({ count: 1, loadA: 300, unrestorableA: 100 })
  })

  it('rows that cannot be read are never saved', () => {
    const rows = review(tsv([7001, 'x', 7002, 200], [7002, 100]))
    expect(rows[0]).toMatchObject({ plan: null, result: null })
    expect(casesToSave(rows, () => 'replace')).toHaveLength(1)
  })

  it('the sector after saving: what it held, with the saved cases in their place', () => {
    const rows = review(tsv([7003, 300, 7001, 250], [7002, 100, 7001, 200]))
    expect(sectorAfter(existing, casesToSave(rows, () => 'replace'), { ratingA: 400 })).toMatchObject({ count: 2, loadA: 400, unrestorableA: 150 })
    expect(sectorAfter(existing, casesToSave(rows, () => 'skip'), { ratingA: 400 })).toMatchObject({ count: 2, loadA: 200, unrestorableA: 100 })
  })

  it('without imported stations nothing can be looked up, and nothing is called missing', () => {
    const [r] = reviewRows(parseSheet(tsv([7001, 320, 7002, 270])).rows, { ...context, directory: new Map() })
    expect(r).toMatchObject({ notFound: [], ambiguous: [] })
  })
})
