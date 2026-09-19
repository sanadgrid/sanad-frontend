import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { columnOf, parseRows, parseSheet } from './bulkParse'
import type { BackupCase } from './model'
import { plansRows, plansWorkbook, templateWorkbook } from './planXlsx'
import { bestSheet, readSheetBytes, rowsToText } from './sheetFile'
import { readWorkbook, SheetFileError } from './xlsxRead'
import { columnName, writeWorkbook } from './xlsxWrite'
import { scanXml } from './xmlScan'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

interface Made {
  name: string
  path: string
  data: string
  state?: string
}

/** A workbook put together by hand, the way another program might write it. */
function workbook(sheets: Made[], shared = '', extra: Record<string, string> = {}): Uint8Array {
  const parts: Record<string, string> = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    '_rels/.rels': `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 7}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${PKG}">${sheets.map((s, i) => `<Relationship Id="rId${i + 7}" Type="${REL}/worksheet" Target="${s.path}"/>`).join('')}<Relationship Id="rId1" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ...(shared && { 'xl/sharedStrings.xml': `<sst xmlns="${MAIN}">${shared}</sst>` }),
  }
  // a target is relative to the workbook's folder, or absolute from the root of the archive
  const placeOf = (path: string) => (path.startsWith('/') ? path.slice(1) : path.startsWith('../') ? path.slice(3) : `xl/${path}`)
  for (const s of sheets) parts[placeOf(s.path)] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN}"><sheetData>${s.data}</sheetData></worksheet>`
  return zipSync(Object.fromEntries(Object.entries({ ...parts, ...extra }).map(([name, xml]) => [name, strToU8(xml)])))
}

const reasonOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof SheetFileError ? error.reason : error
  }
  return 'read'
}

describe('the scan of a part', () => {
  it('names without their prefix, attributes, entities, and what is not content', () => {
    const seen: string[] = []
    scanXml(`<?xml version="1.0"?><!-- note --><x:a k="1 &gt; 0" r:id='q'>T &amp; <b/>&#1605;&#x645;<![CDATA[<raw>]]></x:a>`, {
      open: (name, a) => seen.push(`+${name}${JSON.stringify(a)}`),
      close: (name) => seen.push(`-${name}`),
      text: (text) => seen.push(text),
    })
    expect(seen).toEqual(['+a{"k":"1 > 0","r:id":"q"}', 'T & ', '+b{}', '-b', 'مم', '<raw>', '-a'])
  })

  it('a part that breaks off is an error, not a loop', () => {
    expect(() => scanXml('<a><b attr="1', {})).toThrow()
  })
})

describe('reading a workbook', () => {
  const SHARED =
    '<si><t>الرئيسي</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">حمل </t></r><r><t>الرئيسي</t></r><rPh><t>ignored</t></rPh></si><si><t>بديل ١</t></si><si><t>حمل ١</t></si><si><t xml:space="preserve"> ملاحظة </t></si><si><t>سطر_x000A_ثانٍ &amp; ثالث</t></si>'

  it('shared and rich text, inline text, numbers, booleans, cached formula results, by the place each cell names', () => {
    const data = [
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="F1" t="s"><v>4</v></c></row>',
      // no C or E: the sheet is sparse; B is a formula with the value it last had
      '<row r="3"><c r="A3"><v>7001</v></c><c r="B3"><f>SUM(X1:X2)</f><v>320.00000000000006</v></c><c r="D3" t="inlineStr"><is><r><t>٢</t></r><r><t>٧٠</t></r></is></c><c r="F3" t="s"><v>5</v></c></row>',
      '<row r="4"><c r="A4" t="str"><f>"70"&amp;"05"</f><v>7005</v></c><c r="B4" t="b"><v>1</v></c><c r="C4" t="e"><v>#N/A</v></c><c r="D4" s="3"/><c r="E4" t="d"><v>2026-01-05T00:00:00</v></c><c r="G4"><v>1.5E+2</v></c></row>',
    ].join('')
    const [sheet, ...others] = readWorkbook(workbook([{ name: 'الخطط', path: 'worksheets/sheet1.xml', data }], SHARED))
    expect(others).toEqual([])
    expect(sheet.name).toBe('الخطط')
    expect(sheet.rows).toEqual([
      ['الرئيسي', 'حمل الرئيسي', 'بديل ١', 'حمل ١', '', 'ملاحظة'],
      [],
      ['7001', '320', '', '٢٧٠', '', 'سطر\nثانٍ & ثالث'],
      ['7005', 'TRUE', '#N/A', '', '2026-01-05T00:00:00', '', '150'],
    ])
  })

  it('cells and rows that do not say where they are follow the one before', () => {
    const data = '<row><c><v>1</v></c><c><v>2</v></c></row><row><c r="C2"><v>3</v></c><c><v>4</v></c></row>'
    expect(readWorkbook(workbook([{ name: 'S', path: 'worksheets/sheet1.xml', data }]))[0].rows).toEqual([['1', '2'], ['', '', '3', '4']])
  })

  it('finds each sheet through the relations, wherever its file is; empty and hidden sheets are left out', () => {
    const row = (n: number) => `<row r="1"><c r="A1"><v>${n}</v></c><c r="B1"><v>5</v></c></row>`
    const sheets = readWorkbook(
      workbook([
        { name: 'فارغة', path: 'worksheets/sheet1.xml', data: '<row r="1"><c r="A1" s="2"/></row>' },
        { name: 'مخفية', path: 'worksheets/sheet2.xml', data: row(1), state: 'hidden' },
        { name: 'بعيدة', path: '/custom/Data/Plans.XML', data: row(2) },
        { name: 'نسبية', path: '../other/s.xml', data: row(3) },
      ]),
    )
    expect(sheets.map((s) => [s.name, s.rows[0][0]])).toEqual([['بعيدة', '2'], ['نسبية', '3']])
  })

  it('a merged title over the header, then the first sheet that holds a plan', () => {
    const title = '<row r="1"><c r="A1" t="inlineStr"><is><t>خطط القطاع</t></is></c></row>'
    const header = '<row r="2"><c r="A2" t="inlineStr"><is><t>Main</t></is></c><c r="B2" t="inlineStr"><is><t>Main load</t></is></c><c r="C2" t="inlineStr"><is><t>Backup 1</t></is></c><c r="D2" t="inlineStr"><is><t>Load 1</t></is></c></row>'
    const plans = `${title}${header}<row r="3"><c r="A3"><v>7001</v></c><c r="B3"><v>320</v></c><c r="C3"><v>7002</v></c><c r="D3" t="inlineStr"><is><t>٢٧٠</t></is></c></row>`
    const notes = '<row r="1"><c r="A1" t="inlineStr"><is><t>ملاحظات</t></is></c><c r="B1" t="inlineStr"><is><t>نص</t></is></c></row>'
    const read = readSheetBytes(workbook([{ name: 'ملاحظات', path: 'worksheets/sheet1.xml', data: notes }, { name: 'الخطط', path: 'worksheets/sheet2.xml', data: `${plans}<mergeCells><mergeCell ref="A1:D1"/></mergeCells>` }]))
    if (read.kind !== 'book') throw new Error('not a workbook')
    expect(read.sheets.map((s) => s.name)).toEqual(['ملاحظات', 'الخطط'])
    expect(read.chosen).toBe(1)
    const [plan] = parseRows(read.sheets[read.chosen].rows).rows
    expect(plan).toMatchObject({ line: 3, main: { no: '7001', loadA: 320 }, backups: [{ no: '7002', loadA: 270 }], problems: [] })
    // what goes into the box reads back the same
    expect(parseSheet(rowsToText(read.sheets[1].rows))).toEqual(parseRows(read.sheets[1].rows))
  })

  it('no sheet with a plan: the first one, so its rows can be seen', () => {
    expect(bestSheet([{ name: 'a', rows: [['x', 'y']] }, { name: 'b', rows: [['z', 'w']] }])).toBe(0)
  })

  it('what is not a workbook says so in a way the dialog can explain', () => {
    expect(reasonOf(() => readWorkbook(strToU8('7001,320')))).toBe('notSheet')
    // the first bytes of the older .xls, which is also what a password leaves
    expect(reasonOf(() => readSheetBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])))).toBe('saveAs')
    expect(reasonOf(() => readWorkbook(zipSync({ 'word/document.xml': strToU8('<w/>') })))).toBe('notSheet')
    expect(reasonOf(() => readWorkbook(zipSync({ 'xl/workbook.bin': new Uint8Array(4), '_rels/.rels': strToU8('<Relationships/>') })))).toBe('saveAs')
    const whole = workbook([{ name: 'S', path: 'worksheets/sheet1.xml', data: '<row r="1"><c r="A1"><v>1</v></c></row>' }])
    expect(reasonOf(() => readWorkbook(whole.subarray(0, whole.length - 40)))).toBe('saveAs')
    expect(reasonOf(() => readWorkbook(workbook([{ name: 'S', path: 'worksheets/sheet1.xml', data: '<row r="1"><c r="A1"><v>1</v></c></row>' }], '', { '[Content_Types].xml': '<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>' })))).toBe('saveAs')
    // a sheet that breaks off in the middle of a cell
    expect(reasonOf(() => readWorkbook(workbook([{ name: 'S', path: 'worksheets/sheet1.xml', data: '' }], '', { 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1' })))).toBe('saveAs')
    expect(reasonOf(() => readSheetBytes(new Uint8Array(10 * 1024 * 1024 + 1)))).toBe('tooBig')
    expect(reasonOf(() => readWorkbook(workbook([{ name: 'S', path: 'worksheets/sheet1.xml', data: '<row r="20001"><c r="A20001"><v>1</v></c></row>' }])))).toBe('tooManyRows')
    expect(reasonOf(() => readSheetBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13])))).toBe('notSheet')
    expect(reasonOf(() => readSheetBytes(strToU8('<html><table><tr><td>7001</td></tr></table></html>')))).toBe('saveAs')
  })

  it('text files still come through as text, whatever their encoding', () => {
    expect(readSheetBytes(strToU8('7001,320,7002,270'))).toEqual({ kind: 'text', text: '7001,320,7002,270' })
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...'7001\t320'].flatMap((c) => [c.charCodeAt(0), 0])])
    expect(readSheetBytes(utf16)).toMatchObject({ kind: 'text' })
  })
})

describe('writing a workbook', () => {
  it('what is written is read back: Arabic text, numbers, blanks, markup and spaces', () => {
    const rows = [['الرئيسي', 'حمل', null, 'ملاحظة'], [7001, 13.8, undefined, ' a < b & "c" '], [], ['٧٠٠٢', 0, '', 'سطر\nثانٍ _x0041_']]
    const [sheet, second] = readWorkbook(writeWorkbook([{ name: 'خطط: [١]/٢', rtl: true, headingRows: 1, rows }, { name: 'تعليمات', rows: [['سطر']] }]))
    expect(sheet.name).toBe('خطط   ١  ٢')
    expect(sheet.rows).toEqual([['الرئيسي', 'حمل', '', 'ملاحظة'], ['7001', '13.8', '', 'a < b & "c"'], [], ['٧٠٠٢', '0', '', 'سطر\nثانٍ _x0041_']])
    expect(second).toEqual({ name: 'تعليمات', rows: [['سطر']] })
  })

  it('the parts a workbook must have, each well formed, the sheet right to left under a frozen heading', () => {
    const parts = unzipSync(templateWorkbook())
    expect(Object.keys(parts)).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'])
    for (const part of Object.values(parts)) {
      const open: string[] = []
      scanXml(new TextDecoder().decode(part), { open: (name) => open.push(name), close: (name) => expect(open.pop()).toBe(name) })
      expect(open).toEqual([])
    }
    const sheet = new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('rightToLeft="1"')
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
    expect(sheet).toContain('<c r="B2"><v>320</v></c>')
    expect(sheet).toMatch(/<c r="A1" s="1" t="s">/)
    expect(columnName(0) + columnName(25) + columnName(26) + columnName(701) + columnName(702)).toBe('AZAAZZAAA')
  })

  it('the template is read as the entry expects it', () => {
    const read = readSheetBytes(templateWorkbook())
    if (read.kind !== 'book') throw new Error('not a workbook')
    // the page of instructions is not offered as a sheet of plans
    expect(read.sheets.map((s) => s.name)).toEqual(['خطط التغذية البديلة'])
    const sheet = parseRows(read.sheets[0].rows)
    expect(sheet.hadHeader).toBe(true)
    expect(sheet.rows.map((r) => [r.line, r.main.no, r.backups.length, r.level, r.voltageKv, r.ratingA, r.problems.length])).toEqual([[2, '7001', 3, 'station', 13.8, undefined, 0], [3, '7005', 2, 'feeder', 13.8, 400, 0]])
  })
})

describe('the plans written out for Excel', () => {
  const cases: BackupCase[] = [
    { id: 'a', level: 'station', voltageKv: 13.8, main: { no: '7001', loadA: 320 }, backups: [7002, 7003, 7004, 7005, 7006].map((no, i) => ({ no: String(no), loadA: 250 + i * 10 })), note: 'ملاحظة، بفاصلة' },
    { id: 'b', level: 'feeder', voltageKv: 33, ratingA: 630, main: { no: 'F-12', loadA: 410.5 }, backups: [{ no: '7007', loadA: 300 }], demo: true },
    { id: 'c', level: 'station', voltageKv: 13.8, main: { no: '7008', loadA: 0 }, backups: [] },
  ]

  it('no result column is taken for an entry column', () => {
    const { rows, resultsFrom } = plansRows(cases, { ratingA: 400 }, 0.87)
    const header = rows[0].map(String)
    expect(header.slice(resultsFrom).filter((name) => columnOf(name) !== null)).toEqual([])
    expect(header.slice(0, resultsFrom).filter((name) => columnOf(name) === null)).toEqual([])
    expect(header.slice(resultsFrom)).toHaveLength(10 + 5 * 3)
  })

  it('an exported file enters again as the same plans, more than three backups included', () => {
    const read = readSheetBytes(plansWorkbook(cases, { ratingA: 400 }, 0.87))
    if (read.kind !== 'book') throw new Error('not a workbook')
    const back = parseRows(read.sheets[read.chosen].rows).rows
    expect(back.map((r) => r.problems)).toEqual([[], [], []])
    expect(back.map(({ main, backups, level, voltageKv, ratingA, note, demo }) => ({ main, backups, level, voltageKv, ratingA, note, demo }))).toEqual(
      cases.map((c) => ({ main: { no: c.main.no.toLowerCase(), loadA: c.main.loadA }, backups: c.backups.map(({ no, loadA }) => ({ no, loadA })), level: c.level, voltageKv: c.voltageKv, ratingA: c.ratingA, note: c.note, demo: c.demo })),
    )
  })

  it('numbers are written as numbers, and the results sit beside the entry', () => {
    const { rows, resultsFrom } = plansRows(cases, { ratingA: 400 }, 0.87)
    expect(rows[1].slice(0, 4)).toEqual([7001, 320, 7002, 250])
    expect(rows[2][0]).toBe('F-12')
    // 5 backups with 150, 140, 130, 120, 110 A to spare: all of 320 A comes back
    expect(rows[1].slice(resultsFrom, resultsFrom + 6)).toEqual([650, 320, 0, 100, 'استعادة كاملة', 400])
    expect(rows[2].slice(resultsFrom, resultsFrom + 6)).toEqual([330, 330, 80.5, 80.4, 'استعادة مرتفعة', 630])
  })
})
