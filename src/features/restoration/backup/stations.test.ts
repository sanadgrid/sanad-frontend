import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { layerIdOf } from '../import/layerId'
import { searchStations, stationDirectory } from '../import/stations'
import type { CompactFeature, Position } from '../import/types'
import { saveStations, saveStationsThenPlans, PlansNotSaved, StationsNotSaved, type StationStore } from '../stationSave'
import { parseSheet } from './bulkParse'
import { reviewRows } from './bulkReview'
import { buildDirectory, elementFloc } from './directory'
import { entryValidations, plansRows, plansWorkbook, STATION_LIST_NAME, templateWorkbook } from './planXlsx'
import { readSheetBytes } from './sheetFile'
import { groupStationChanges, mergeStationFeatures, stationFeature } from './stationLayers'
import { coordinateOf, isStationSheet, parseStationRows, stationColumnOf } from './stationParse'
import { reviewStations, sectorBox, stationLayerPath, stationPins } from './stationReview'
import { DEFAULT_STATION_LAYER, SPARE_ROWS, stationsExportRows, stationsExportWorkbook, stationsSheet, stationsTemplateWorkbook } from './stationSheet'
import { readWorkbook } from './xlsxRead'
import { sheetRef, writeWorkbook } from './xlsxWrite'
import { scanXml } from './xmlScan'

const CENTER = { lat: 24.7136, lng: 46.6753 }
const at = (dx: number, dy: number): Position => [CENTER.lng + dx, CENTER.lat + dy]
const decode = (part: Uint8Array) => new TextDecoder().decode(part)
const sheetXml = (book: Uint8Array, n: number) => decode(unzipSync(book)[`xl/worksheets/sheet${n}.xml`])

// ~900 stations on a loose grid; every 30th number stands at a second place, 7001 at three
function bigDirectory(count = 900) {
  const layerA = Array.from({ length: count }, (_, i) => ({ no: String(7001 + i), c: at((i % 30) * 0.01, Math.floor(i / 30) * 0.01), ...(i % 5 === 0 && { f: `1000-SYN-${7001 + i}` }) }))
  const layerB = Array.from({ length: count / 30 }, (_, i) => ({ no: String(7001 + i * 30), n: `S/S ${7001 + i * 30} T2`, c: at(0.4 + i * 0.001, 0.4) }))
  return buildDirectory([
    { id: 'a', name: 'Zone A', stations: layerA },
    { id: 'b', name: 'Zone B', stations: [...layerB, { no: '7001', c: at(0.5, 0.5) }] },
  ])
}

const small = buildDirectory([
  { id: 'a', name: 'Zone A', stations: [{ no: '7001', c: at(0, 0), f: '1000-SYN-7001' }, { no: '7002', n: 'S/S 7002 North', c: at(0.02, 0.01) }, { no: '7005', c: at(0.05, 0.05) }, { no: '7005', c: at(0.08, 0.05) }] },
])
const box = sectorBox(CENTER, small)
const review = (rows: string[][], fixed?: Set<number>) => reviewStations(parseStationRows(rows).rows, { directory: small, box, fixed })
const HEADER = ['رقم المحطة', 'FLOCSAP', 'الاسم', 'خط العرض', 'خط الطول', 'الطبقة']
const cell = (value: number) => String(value)

describe('data validation in the written workbook', () => {
  it('sits between the cells and the page margins, with sheet names quoted and escaped', () => {
    const book = writeWorkbook(
      [
        { name: 'A & B', rows: [['x'], ['y']], validations: [{ sqref: 'A2:A9', type: 'list', formula1: sheetRef("O'Neil <list>", '$A$2:$A$4'), errorStyle: 'warning', errorTitle: 'ttl', error: 'a "quoted" <err>', prompt: 'p' }, { sqref: 'B2:B9', type: 'none', prompt: 'only a prompt' }] },
        { name: "O'Neil <list>", rows: [['n'], [1], [2]] },
      ],
      [{ name: 'Numbers', ref: sheetRef("O'Neil <list>", '$A$2:$A$4') }],
    )
    const xml = sheetXml(book, 1)
    expect(xml).toMatch(/<\/sheetData><dataValidations count="2"><dataValidation type="list" errorStyle="warning" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="ttl" error="a &quot;quoted&quot; &lt;err&gt;" prompt="p" sqref="A2:A9"><formula1>'O''Neil &lt;list&gt;'!\$A\$2:\$A\$4<\/formula1><\/dataValidation><dataValidation allowBlank="1" showInputMessage="1" prompt="only a prompt" sqref="B2:B9"><\/dataValidation><\/dataValidations><pageMargins/)
    expect(decode(unzipSync(book)['xl/workbook.xml'])).toContain(`</sheets><definedNames><definedName name="Numbers">'O''Neil &lt;list&gt;'!$A$2:$A$4</definedName></definedNames></workbook>`)
    // every part still well formed
    for (const part of Object.values(unzipSync(book))) {
      const open: string[] = []
      scanXml(decode(part), { open: (name) => open.push(name), close: (name) => expect(open.pop()).toBe(name) })
      expect(open).toEqual([])
    }
  })

  it('a text column and a coordinate column keep their format on blank cells too, and a marked row takes the soft fill', () => {
    const book = writeWorkbook([{ name: 's', headingRows: 1, formats: [undefined, 'text', 'coord'], marked: new Set([2]), rows: [['a', 'b', 'c'], [1, '007', 24.71], [2, '008', 46.67]] }])
    const xml = sheetXml(book, 1)
    expect(xml).toContain('<cols><col min="2" max="2" style="7"/><col min="3" max="3" style="5"/></cols>')
    expect(xml).toContain('<c r="B2" s="7" t="s">')
    expect(xml).toContain('<c r="A3" s="4"><v>2</v></c><c r="B3" s="8" t="s">')
    expect(xml).toContain('<c r="C3" s="6"><v>46.67</v></c>')
    expect(decode(unzipSync(book)['xl/styles.xml'])).toContain('<numFmt numFmtId="164" formatCode="0.000000"/>')
  })
})

describe('the template with the stations of the project', () => {
  const directory = bigDirectory()

  it('lists every number once, sorted, with the extra places on their own sheet, and points the drop-downs at the list', () => {
    const { sheet, listRef, duplicates } = stationsSheet(directory)
    expect(sheet.rows).toHaveLength(901)
    expect(sheet.rows[1]).toEqual([7001, '1000-SYN-7001', 'S/S 7001', CENTER.lat, CENTER.lng, 'Zone A', 3])
    expect(sheet.rows.slice(1).map((r) => r[0])).toEqual(Array.from({ length: 900 }, (_, i) => 7001 + i))
    expect(listRef).toBe(`'المحطات'!$A$2:$A$${901 + SPARE_ROWS}`)
    expect(duplicates).toBe(30)
    expect(sheet.marked?.has(1)).toBe(true)
    expect(sheet.marked?.has(2)).toBe(false)

    const book = templateWorkbook(directory)
    const parts = unzipSync(book)
    expect(decode(parts['xl/workbook.xml'])).toContain(`<sheet name="خطط التغذية البديلة" sheetId="1" r:id="rId1"/><sheet name="المحطات" sheetId="2" r:id="rId2"/><sheet name="مواقع مكررة" sheetId="3" r:id="rId3"/><sheet name="تعليمات" sheetId="4" r:id="rId4"/>`)
    expect(decode(parts['xl/workbook.xml'])).toContain(`<definedName name="${STATION_LIST_NAME}">${listRef}</definedName>`)
    const entry = decode(parts['xl/worksheets/sheet1.xml'])
    expect(entry).toContain(`sqref="A2:A500 C2:C500 E2:E500 G2:G500 I2:I500 K2:K500"><formula1>${listRef}</formula1>`)
    expect(entry).toContain('sqref="B2:B500 D2:D500 F2:F500 H2:H500 J2:J500 L2:L500"><formula1>0</formula1>')
    expect(entry).toContain('sqref="M2:M500"><formula1>"محطة,مغذي"</formula1>')
    expect(entry).toContain('sqref="N2:N500"><formula1>"13.8,33"</formula1>')
    // with stations to choose from there are no example lines, and the list itself has 5 backup pairs
    expect(entry).not.toContain('<row r="2">')
    expect(entry).toContain('<dimension ref="A1:P1"/>')
    const places = readWorkbook(book).find((s) => s.name === 'مواقع مكررة')
    expect(places?.rows).toHaveLength(1 + 30 * 2 + 1)
    expect(places?.rows[1].slice(0, 2)).toEqual(['7001', '1'])
    console.info(`template with 900 stations: ${book.length} bytes`)
    expect(book.length).toBeLessThan(120_000)
  })

  it('reads back as the entry expects: the stations sheet is set apart and the entry sheet is what is offered', () => {
    const read = readSheetBytes(templateWorkbook(directory))
    if (read.kind !== 'book') throw new Error('not a workbook')
    expect(read.sheets.map((s) => s.name)).toEqual(['خطط التغذية البديلة'])
    expect(read.stationSheets.map((s) => s.name)).toEqual(['المحطات', 'مواقع مكررة'])
    const stations = parseStationRows(read.stationSheets[0].rows)
    expect(stations.hadHeader).toBe(true)
    expect(stations.rows).toHaveLength(900)
    expect(stations.rows[0]).toMatchObject({ line: 2, no: '7001', floc: '1000-SYN-7001', name: 'S/S 7001', lat: CENTER.lat, lng: CENTER.lng, layer: 'Zone A', problem: null })
    // every listed station is already there: nothing to write
    const reviewed = reviewStations(stations.rows, { directory, box: sectorBox(CENTER, directory) })
    expect(new Set(reviewed.map((r) => r.state))).toEqual(new Set(['exists']))
  })

  it('without stations: example lines, an empty stations sheet, and the lists still point at it', () => {
    const book = templateWorkbook(new Map())
    const entry = sheetXml(book, 1)
    expect(entry).toContain('<row r="2">')
    expect(entry).toContain(`<formula1>'المحطات'!$A$2:$A$${1 + SPARE_ROWS}</formula1>`)
    expect(sheetXml(book, 2)).toContain('sqref="D2:D201"><formula1>-90</formula1><formula2>90</formula2>')
  })

  it('an export carries the same lists and sheet, its FLOCSAP columns read as results, and enters again', () => {
    const cases = [{ id: 'a', level: 'station' as const, voltageKv: 13.8, main: { no: '7001', loadA: 320 }, backups: [{ no: '7006', loadA: 270, at: at(0.05, 0), layerId: 'a' }] }]
    const { rows, resultsFrom } = plansRows(cases, { ratingA: 400 }, 0.87, directory)
    expect(rows[0].slice(resultsFrom, resultsFrom + 6)).toEqual(['FLOCSAP الرئيسي', 'FLOCSAP بديل ١', 'FLOCSAP بديل ٢', 'FLOCSAP بديل ٣', 'FLOCSAP بديل ٤', 'FLOCSAP بديل ٥'])
    expect(rows[1].slice(resultsFrom, resultsFrom + 2)).toEqual(['1000-SYN-7001', '1000-SYN-7006'])
    const book = plansWorkbook(cases, { ratingA: 400 }, 0.87, directory)
    expect(sheetXml(book, 1)).toContain(`sqref="A2:A500 C2:C500 E2:E500 G2:G500 I2:I500 K2:K500"><formula1>'المحطات'!$A$2:$A$1101</formula1>`)
    const read = readSheetBytes(book)
    if (read.kind !== 'book') throw new Error('not a workbook')
    expect(read.stationSheets[0].rows).toHaveLength(901)
    const back = parseSheet(read.sheets[0].rows.map((r) => r.join('\t')).join('\n')).rows
    expect(back[0]).toMatchObject({ main: { no: '7001', loadA: 320 }, backups: [{ no: '7006', loadA: 270 }], problems: [] })
  })

  it('the validations of an entry sheet with more rows reach past its last plan', () => {
    expect(entryValidations(2, 750, 'L')[0]).toMatchObject({ sqref: 'A2:A750 C2:C750 E2:E750', formula1: 'L', errorStyle: 'warning' })
    expect(entryValidations(2, 750, 'L').map((v) => v.sqref.split(' ')[0])).toEqual(['A2:A750', 'B2:B750', 'G2:G750', 'H2:H750', 'I2:I750'])
  })
})

describe('the stations sheet read in', () => {
  it('headers in Arabic or English, in any order, with the FLOCSAP under its variants', () => {
    for (const header of ['FLOCSAP', 'floc', 'FLOC SAP', 'SAP FLOC', 'Functional Location', 'الموقع الوظيفي']) expect(stationColumnOf(header)).toBe('floc')
    expect(['Station number', 'رقم المحطة', 'No', 'ID', 'Latitude', 'خط العرض', 'lng', 'Longitude', 'خط الطول', 'Layer', 'الطبقة', 'Station name', 'الاسم', 'عدد المواقع', 'لها خطة'].map(stationColumnOf)).toEqual(['no', 'no', 'no', 'no', 'lat', 'lat', 'lng', 'lng', 'lng', 'layer', 'layer', 'name', 'name', null, null])
    const { rows, hadHeader } = parseStationRows([['Longitude', 'Layer', 'FLOC', 'Station name', 'Latitude', 'No'], ['46.7', 'Z', ' 0012-A ', 'North', '24.7', 'S/S 7001'], [], ['٤٦٫٨', '', '', '', '٢٤٫٨', '٧٠٠٢']])
    expect(hadHeader).toBe(true)
    expect(rows).toEqual([
      { line: 2, no: '7001', floc: '0012-A', name: 'North', layer: 'Z', lat: 24.7, lng: 46.7, problem: null },
      { line: 4, no: '7002', name: '', layer: '', lat: 24.8, lng: 46.8, problem: null },
    ])
  })

  it('without a header: number, name, latitude, longitude; and what cannot be read is said', () => {
    const { rows, hadHeader } = parseStationRows([['7001', 'A', '24.7', '46.7'], ['70010', '', '24.7', '46.7'], ['', '', '24.7', '46.7'], ['7003', '', '', ''], ['7004', '', 'x', '46.7'], ['7005', '', '24,7', '46.7°']])
    expect(hadHeader).toBe(false)
    expect(rows.map((r) => [r.no, r.problem, r.lat, r.lng])).toEqual([['7001', null, 24.7, 46.7], ['70010', 'badNumber', 24.7, 46.7], ['', 'noNumber', 24.7, 46.7], ['7003', 'noCoords', null, null], ['7004', 'badCoords', null, 46.7], ['7005', null, 24.7, 46.7]])
    expect(coordinateOf('-46.5')).toBe(-46.5)
    expect(coordinateOf('1,250')).toBe(1.25)
  })

  it('a FLOCSAP stays text with its leading zeros, trimmed and cut at 40 characters', () => {
    const long = '0'.repeat(50)
    const { rows } = parseStationRows([HEADER, ['7001', ` 000123 `, '', '24.7', '46.7', ''], ['7002', long, '', '24.7', '46.7', '']])
    expect(rows[0].floc).toBe('000123')
    expect(rows[1].floc).toBe('0'.repeat(40))
  })

  it('knows a stations sheet by its name or by its header, and a plans sheet is not one', () => {
    expect(isStationSheet({ name: 'Stations', rows: [] })).toBe(true)
    expect(isStationSheet({ name: 'ورقة1', rows: [['ملاحظات'], ['رقم المحطة', 'خط العرض', 'خط الطول']] })).toBe(true)
    expect(isStationSheet({ name: 'ورقة1', rows: [['الرئيسي', 'حمل الرئيسي', 'بديل ١', 'حمل ١'], ['7001', '320', '7002', '270']] })).toBe(false)
    expect(isStationSheet({ name: 'Sheet1', rows: [['Main station', 'Main load', 'Backup station 1', 'Load 1']] })).toBe(false)
  })
})

describe('the review of the sheet against the sector', () => {
  it('new, existing, moved, a FLOCSAP update, outside, swapped and bad rows, and the same number given twice', () => {
    const reviewed = review([
      HEADER,
      ['7010', '', '', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''],
      ['7001', '', '', cell(CENTER.lat), cell(CENTER.lng), ''],
      ['7001', '', '', cell(CENTER.lat + 0.00002), cell(CENTER.lng + 0.00002), ''],
      ['7001', '', '', cell(CENTER.lat + 0.2), cell(CENTER.lng), ''],
      ['7002', '1000-SYN-7002', '', cell(CENTER.lat + 0.01), cell(CENTER.lng + 0.02), ''],
      ['7001', '1000-SYN-7001', '', cell(CENTER.lat), cell(CENTER.lng), ''],
      ['7011', '', '', '10', '10', ''],
      ['7012', '', '', cell(CENTER.lng), cell(CENTER.lat), ''],
      ['7013', '', '', '', '', ''],
      ['7010', '', '', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''],
    ])
    expect(reviewed.map((r) => r.state)).toEqual(['new', 'exists', 'exists', 'moved', 'flocUpdate', 'exists', 'outside', 'swapped', 'bad', 'exists'])
    expect(reviewed[4].point?.layerId).toBe('a')
    const fixed = review([HEADER, ['7012', '', '', cell(CENTER.lng), cell(CENTER.lat), '']], new Set([2]))
    expect(fixed[0]).toMatchObject({ state: 'new', at: CENTER })
  })

  it('warns when one FLOCSAP is given to two numbers, in the sheet or against what is stored', () => {
    const reviewed = review([HEADER, ['7020', 'SAME', '', cell(CENTER.lat + 0.1), cell(CENTER.lng), ''], ['7021', 'SAME', '', cell(CENTER.lat + 0.11), cell(CENTER.lng), ''], ['7022', '1000-SYN-7001', '', cell(CENTER.lat + 0.12), cell(CENTER.lng), ''], ['7023', 'OWN', '', cell(CENTER.lat + 0.13), cell(CENTER.lng), '']])
    expect(reviewed.map((r) => r.flocClash)).toEqual([['7021'], ['7020'], ['7001'], undefined])
  })

  it('the box takes in the stations of the sector, however far from its centre', () => {
    const far = buildDirectory([{ id: 'x', name: 'X', stations: [{ no: '8001', c: at(3, 3) }] }])
    expect(sectorBox(CENTER, far)).toEqual({ south: CENTER.lat - 2, north: CENTER.lat + 3.5, west: CENTER.lng - 2, east: CENTER.lng + 3.5 })
  })
})

describe('what the stations become in a layer', () => {
  const rows = review([HEADER, ['7010', '0010', 'North', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''], ['7011', '', 'S/S 7011 East', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.12), 'Own'], ['7001', '1000-SYN-7001-B', '', cell(CENTER.lat), cell(CENTER.lng), '']])

  it('a point named by its number, the given name kept, the FLOCSAP with it', () => {
    expect(stationFeature(rows[0])).toEqual({ t: 'p', n: 'S/S 7010 North', c: [CENTER.lng + 0.1, CENTER.lat + 0.1], d: 'North', f: '0010' })
    expect(stationFeature(rows[1])).toEqual({ t: 'p', n: 'S/S 7011 East', c: [CENTER.lng + 0.12, CENTER.lat + 0.1] })
    expect(stationDirectory([stationFeature(rows[0])])).toEqual([{ no: '7010', n: 'S/S 7010 North', c: [CENTER.lng + 0.1, CENTER.lat + 0.1], f: '0010' }])
  })

  it('goes to the layer it names, the FLOCSAP update to the layer that lists the station', () => {
    const layers = [{ id: 'a', name: 'Zone A', path: 'doc/a', sourceFile: 'x.kmz', style: { color: '#123' } }]
    const changes = groupStationChanges(rows, layers, 'central')
    expect(changes.map((c) => [c.id, c.name, c.path, c.existing?.id ?? null, c.rows.length])).toEqual([
      [layerIdOf('central', DEFAULT_STATION_LAYER, stationLayerPath(DEFAULT_STATION_LAYER)), DEFAULT_STATION_LAYER, stationLayerPath(DEFAULT_STATION_LAYER), null, 1],
      [layerIdOf('central', 'Own', stationLayerPath('Own')), 'Own', stationLayerPath('Own'), null, 1],
      ['a', 'Zone A', 'doc/a', 'a', 1],
    ])
  })

  it('merging is idempotent and a FLOCSAP is updated in place, never erased by an empty cell', () => {
    const existing: CompactFeature[] = [{ t: 'p', n: 'S/S 7001', c: at(0, 0), f: '1000-SYN-7001' }, { t: 'l', n: 'route', c: [at(0, 0), at(1, 1)] }]
    const first = mergeStationFeatures(existing, [rows[0], rows[2]])
    expect(first.changed).toBe(true)
    expect(first.features).toHaveLength(3)
    expect(first.features[0]).toEqual({ t: 'p', n: 'S/S 7001', c: at(0, 0), f: '1000-SYN-7001-B' })
    const again = mergeStationFeatures(first.features, [rows[0], rows[2]])
    expect(again.changed).toBe(false)
    const blank = review([HEADER, ['7001', '', '', cell(CENTER.lat), cell(CENTER.lng), '']])
    expect(mergeStationFeatures(first.features, blank)).toEqual({ features: first.features, changed: false })
  })
})

describe('plans that stand on stations of the same sheet', () => {
  const sheet = review([HEADER, ['7010', '', '', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''], ['7005', '', '', cell(CENTER.lat + 0.3), cell(CENTER.lng), 'Own']])
  const pins = stationPins(sheet, 'central')

  it('gives an element the sheet\'s point, even where the number was unknown or stood at several places', () => {
    expect([...pins.keys()]).toEqual(['7010', '7005'])
    expect(pins.get('7005')).toEqual({ at: [CENTER.lng, CENTER.lat + 0.3], layerId: layerIdOf('central', 'Own', stationLayerPath('Own')) })
    const [r] = reviewRows(parseSheet('7010\t320\t7005/F2\t270\t7001\t200\t7099\t100').rows, { existing: [], directory: small, options: {}, newId: () => 'id', pins })
    expect(r.plan?.main).toEqual({ no: '7010', loadA: 320, at: pins.get('7010')?.at, layerId: pins.get('7010')?.layerId })
    expect(r.plan?.backups[0]).toMatchObject({ no: '7005/f2', at: [CENTER.lng, CENTER.lat + 0.3] })
    expect(r.plan?.backups[1]).toMatchObject({ no: '7001', layerId: 'a' })
    expect(r.notFound).toEqual(['7099'])
    expect(r.ambiguous).toEqual([])
    // without the sheet, the same row is unplaced and ambiguous as before
    const [plain] = reviewRows(parseSheet('7010\t320\t7005\t270').rows, { existing: [], directory: small, options: {}, newId: () => 'id' })
    expect([plain.notFound, plain.ambiguous]).toEqual([['7010'], ['7005']])
  })

  it('a number the sheet places twice settles nothing', () => {
    const twice = review([HEADER, ['7010', '', '', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''], ['7010', '', '', cell(CENTER.lat + 0.2), cell(CENTER.lng + 0.1), '']])
    expect(stationPins(twice, 'central').size).toBe(0)
  })
})

describe('the stations export', () => {
  const directory = small
  const cases = [{ id: 'a', level: 'station' as const, voltageKv: 13.8, main: { no: '7001', loadA: 320 }, backups: [{ no: '7002', loadA: 100 }] }]

  it('one row per place, with the plan facts, numbers as numbers and the FLOCSAP as text', () => {
    const rows = stationsExportRows(directory, cases, { ratingA: 400 })
    expect(rows[0]).toEqual([...HEADER, 'لها خطة', 'نسبة الاستعادة ٪'])
    expect(rows.slice(1)).toEqual([
      [7001, '1000-SYN-7001', 'S/S 7001', CENTER.lat, CENTER.lng, 'Zone A', 'نعم', 93.8],
      [7002, null, 'S/S 7002 North', CENTER.lat + 0.01, CENTER.lng + 0.02, 'Zone A', 'لا', null],
      [7005, null, 'S/S 7005', CENTER.lat + 0.05, CENTER.lng + 0.05, 'Zone A', 'لا', null],
      [7005, null, 'S/S 7005', CENTER.lat + 0.05, CENTER.lng + 0.08, 'Zone A', 'لا', null],
    ])
    const xml = sheetXml(stationsExportWorkbook(directory, cases, { ratingA: 400 }), 1)
    expect(xml).toContain('<col min="2" max="2" width="20" customWidth="1" style="7"/>')
    expect(xml).toContain('<c r="A2"><v>7001</v></c><c r="B2" s="7" t="s">')
  })

  it('round trip: what was exported comes back as stations that all exist, and FLOCSAP leading zeros survive', () => {
    const zeros = buildDirectory([{ id: 'a', name: 'Zone A', stations: [{ no: '7001', c: at(0, 0), f: '000123' }] }])
    const read = readSheetBytes(stationsExportWorkbook(zeros, [], {}))
    if (read.kind !== 'book') throw new Error('not a workbook')
    expect(read.stationSheets).toHaveLength(1)
    const back = parseStationRows(read.stationSheets[0].rows).rows
    expect(back[0].floc).toBe('000123')
    expect(reviewStations(back, { directory: zeros, box: sectorBox(CENTER, zeros) }).map((r) => r.state)).toEqual(['exists'])
    const whole = readSheetBytes(stationsExportWorkbook(directory, cases, {}))
    if (whole.kind !== 'book') throw new Error('not a workbook')
    expect(review(whole.stationSheets[0].rows).map((r) => r.state)).toEqual(['exists', 'exists', 'exists', 'exists'])
  })

  it('the stations template reads back as two example rows', () => {
    const read = readSheetBytes(stationsTemplateWorkbook())
    if (read.kind !== 'book') throw new Error('not a workbook')
    const rows = parseStationRows(read.stationSheets[0].rows).rows
    expect(rows.map((r) => [r.no, r.floc, r.problem])).toEqual([['7001', '1000-RYD-7001', null], ['7002', '1000-RYD-7002', null]])
  })
})

describe('the FLOCSAP around the page', () => {
  it('is carried by the directory and found by the search, exact or by its start', () => {
    expect(small.get('7001')?.floc).toBe('1000-SYN-7001')
    expect(elementFloc(small, { no: '7001/F3' })).toBe('1000-SYN-7001')
    expect(elementFloc(small, { no: '7002' })).toBeNull()
    const layers = [{ id: 'a', name: 'Zone A', stations: [{ no: '7001', c: at(0, 0), f: '1000-SYN-7001' }, { no: '7002', c: at(0, 0) }] }]
    expect(searchStations(layers, '1000-syn', 5).hits.map((h) => h.station.no)).toEqual(['7001'])
    expect(searchStations(layers, '1000-SYN-7001', 5).total).toBe(1)
    expect(searchStations(layers, 'SYN', 5).total).toBe(0)
  })
})

describe('writing the stations, then the plans', () => {
  // listed as the database lists it: under the id its name and folder give
  const zoneA = layerIdOf('central', 'Zone A', 'doc/a')
  const layers = [{ id: zoneA, name: 'Zone A', path: 'doc/a', sourceFile: 'x.kmz', style: { color: '#123' } }]
  const stored = new Map<string, CompactFeature[]>([[zoneA, [{ t: 'p', n: 'S/S 7001', c: at(0, 0) }]]])
  const store = (log: string[]): StationStore => ({
    load: async (_s, id) => {
      log.push(`load ${id}`)
      return stored.get(id) ?? []
    },
    save: async (_s, layer) => {
      const id = layerIdOf('central', layer.name, layer.path)
      log.push(`save ${layer.name} ${layer.counts.point}`)
      stored.set(id, layer.features)
      return id
    },
  })
  const sheet = buildDirectory([{ id: zoneA, name: 'Zone A', stations: [{ no: '7001', c: at(0, 0) }] }])
  const rows = reviewStations(parseStationRows([HEADER, ['7010', '', '', cell(CENTER.lat + 0.1), cell(CENTER.lng + 0.1), ''], ['7001', 'NEW-FLOC', '', cell(CENTER.lat), cell(CENTER.lng), '']]).rows, { directory: sheet, box })

  it('writes each layer once, and nothing the second time', async () => {
    const log: string[] = []
    const ids = await saveStations('central', rows, layers as never, store(log))
    expect(log).toEqual([`save ${DEFAULT_STATION_LAYER} 1`, `load ${zoneA}`, 'save Zone A 1'])
    expect(ids).toHaveLength(2)
    expect(stored.get(zoneA)?.[0]).toMatchObject({ f: 'NEW-FLOC' })
    const again: string[] = []
    const listed = [...layers, { id: ids[0], name: DEFAULT_STATION_LAYER, path: stationLayerPath(DEFAULT_STATION_LAYER), sourceFile: 'Excel', style: { color: '#456' } }]
    expect(await saveStations('central', rows, listed as never, store(again))).toEqual([])
    expect(again).toEqual([`load ${ids[0]}`, `load ${zoneA}`])
  })

  it('the plans are not tried when the stations fail; a failure after them says they went in', async () => {
    const steps: string[] = []
    const plans = async () => {
      steps.push('plans')
    }
    await expect(saveStationsThenPlans(() => Promise.reject(new Error('refused')), plans)).rejects.toBeInstanceOf(StationsNotSaved)
    expect(steps).toEqual([])
    const failure = await saveStationsThenPlans(async () => ['id'], () => Promise.reject(new Error('refused'))).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(PlansNotSaved)
    expect((failure as PlansNotSaved).stationsWritten).toBe(true)
    expect(await saveStationsThenPlans(async () => [], plans)).toEqual([])
    expect(steps).toEqual(['plans'])
  })
})
