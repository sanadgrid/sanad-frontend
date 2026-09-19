import { normalizeQuery, stationNoOf } from '../import/stations'
import { allPoints, type StationDirectory, type StationPoint } from './directory'
import { assessCase, type BackupCase, type ModelOptions } from './model'
import { columnName, sheetRef, writeWorkbook, type XlsxSheet, type XlsxValidation } from './xlsxWrite'

// The stations of the project as a sheet: the list the entry's drop-downs draw
// on, a place to add a station by its number and coordinates, and a file of
// their own to take out and bring back. Pure.

export const STATIONS_SHEET = 'المحطات'
export const PLACES_SHEET = 'مواقع مكررة'
/** The layer stations typed into a sheet land in, unless the sheet names one. */
export const DEFAULT_STATION_LAYER = 'محطات مضافة يدوياً'
export const STATION_HEADER = ['رقم المحطة', 'FLOCSAP', 'الاسم', 'خط العرض', 'خط الطول', 'الطبقة']
/** Empty, validated rows under the stations, for the ones typed in by hand. */
export const SPARE_ROWS = 200
const PLACES_COLUMN = 'عدد المواقع'
const STATION_WIDTHS = [13, 20, 28, 13, 13, 24, 12]
const LATITUDE_PROMPT = 'أدخل خط العرض بالدرجات العشرية، مثل 24.7136'
const LONGITUDE_PROMPT = 'أدخل خط الطول بالدرجات العشرية، مثل 46.6753'
const NUMBER_ERROR = 'رقم المحطة من أربع خانات، مثل 7001'
const FLOC_PROMPT = 'رقم المحطة في نظام SAP — اختياري، يُحفظ نصاً كما هو'
const STATION_FORMATS: XlsxSheet['formats'] = [undefined, 'text', undefined, 'coord', 'coord']

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits
const byNumber = (a: { no: string }, b: { no: string }) => Number(a.no) - Number(b.no)

/** The row a place is written as: number, FLOCSAP, name, latitude, longitude, layer. */
const placeRow = (p: StationPoint) => [Number(p.no), p.floc ?? null, p.name, p.at.lat, p.at.lng, p.layerName]

/** The validations of the stations columns, down to `last`: what a station is made of. */
export function stationValidations(last: number): XlsxValidation[] {
  const rows = (column: number) => `${columnName(column)}2:${columnName(column)}${last}`
  return [
    { sqref: rows(0), type: 'whole', operator: 'between', formula1: '1000', formula2: '9999', errorTitle: 'رقم المحطة', error: NUMBER_ERROR, promptTitle: 'رقم المحطة', prompt: NUMBER_ERROR },
    { sqref: rows(1), type: 'none', promptTitle: 'FLOCSAP', prompt: FLOC_PROMPT },
    { sqref: rows(3), type: 'decimal', operator: 'between', formula1: '-90', formula2: '90', errorTitle: 'خط العرض', error: 'خط العرض بين -90 و90', promptTitle: 'خط العرض', prompt: LATITUDE_PROMPT },
    { sqref: rows(4), type: 'decimal', operator: 'between', formula1: '-180', formula2: '180', errorTitle: 'خط الطول', error: 'خط الطول بين -180 و180', promptTitle: 'خط الطول', prompt: LONGITUDE_PROMPT },
  ]
}

/**
 * The stations sheet of a plans workbook: every number once, at its first
 * place, then empty rows for new ones. The drop-downs of the entry sheet list
 * the numbers column down to the last empty row.
 */
export function stationsSheet(directory: StationDirectory): { sheet: XlsxSheet; listRef: string; duplicates: number } {
  const stations = [...directory.values()].sort(byNumber)
  const rows = [[...STATION_HEADER, PLACES_COLUMN], ...stations.map((s) => [...placeRow(s.points[0]), s.points.length])]
  const marked = new Set(stations.flatMap((s, i) => (s.points.length > 1 ? [i + 1] : [])))
  const last = rows.length + SPARE_ROWS
  const sheet: XlsxSheet = { name: STATIONS_SHEET, rtl: true, headingRows: 1, widths: STATION_WIDTHS, formats: STATION_FORMATS, marked, rows, validations: stationValidations(last) }
  return { sheet, listRef: sheetRef(STATIONS_SHEET, `$A$2:$A$${last}`), duplicates: marked.size }
}

/** Numbers that stand at several places, every place on a row of its own; `null` when none does. */
export function placesSheet(directory: StationDirectory): XlsxSheet | null {
  const repeated = [...directory.values()].filter((s) => s.points.length > 1).sort(byNumber)
  if (repeated.length === 0) return null
  const rows = [['رقم المحطة', 'الموقع', 'FLOCSAP', 'الاسم', 'خط العرض', 'خط الطول', 'الطبقة'], ...repeated.flatMap((s) => s.points.map((p, i) => [Number(p.no), i + 1, p.floc ?? null, p.name, p.at.lat, p.at.lng, p.layerName]))]
  return { name: PLACES_SHEET, rtl: true, headingRows: 1, widths: [13, 9, 20, 28, 13, 13, 24], formats: [undefined, undefined, 'text', undefined, 'coord', 'coord'], rows }
}

/** By station number: whether a plan names it as its main element, and the weakest such plan's ratio. */
export function planFacts(cases: BackupCase[], options: ModelOptions): ReadonlyMap<string, number> {
  const facts = new Map<string, number>()
  for (const c of cases) {
    const no = stationNoOf(normalizeQuery(c.main.no)) ?? normalizeQuery(c.main.no)
    const ratio = assessCase(c, options).ratio
    facts.set(no, Math.min(facts.get(no) ?? Infinity, ratio))
  }
  return facts
}

const EXPORT_HEADER = [...STATION_HEADER, 'لها خطة', 'نسبة الاستعادة ٪']

/** Every place of every station, with what the plans say about it. */
export function stationsExportRows(directory: StationDirectory, cases: BackupCase[], options: ModelOptions) {
  const facts = planFacts(cases, options)
  const points = allPoints(directory).sort((a, b) => byNumber(a, b) || a.layerName.localeCompare(b.layerName, 'ar'))
  return [EXPORT_HEADER, ...points.map((p) => {
    const ratio = facts.get(p.no)
    return [...placeRow(p), ratio === undefined ? 'لا' : 'نعم', ratio === undefined ? null : round(ratio * 100, 1)]
  })]
}

export const stationsExportWorkbook = (directory: StationDirectory, cases: BackupCase[], options: ModelOptions): Uint8Array =>
  writeWorkbook([{ name: STATIONS_SHEET, rtl: true, headingRows: 1, resultsFrom: STATION_HEADER.length, widths: [...STATION_WIDTHS.slice(0, 6), 10, 16], formats: STATION_FORMATS, rows: stationsExportRows(directory, cases, options) }])

const TEMPLATE_NOTE = 'مثال — احذف هذا السطر'
const STATION_GUIDE = [
  'طريقة تعبئة الجدول',
  'رقم المحطة: أربع خانات، مثل 7001. FLOCSAP: رقم المحطة في نظام SAP، اختياري ويُحفظ نصاً كما هو.',
  'الاسم: اختياري. خط العرض وخط الطول: بالدرجات العشرية، مثل 24.7136 و46.6753.',
  `الطبقة: اسم الطبقة التي تظهر فيها المحطة على الخريطة. الخانة الفارغة تعني «${DEFAULT_STATION_LAYER}».`,
  'المحطة الموجودة في نفس الموقع تُتجاوز، والموجودة بموقع مختلف تُضاف موقعاً إضافياً لها. إدخال الملف نفسه مرتين لا يكرر شيئاً.',
  'احذف سطرَي المثال قبل اختيار الملف في «استيراد محطات من Excel».',
]

/** Two made-up stations under the header, and how to fill the rest. */
export const stationsTemplateRows = () => [
  STATION_HEADER,
  [7001, '1000-RYD-7001', 'S/S 7001', 24.7136, 46.6753, DEFAULT_STATION_LAYER],
  [7002, '1000-RYD-7002', 'محطة الشمال', 24.7311, 46.6902, TEMPLATE_NOTE],
]

export const stationsTemplateWorkbook = (): Uint8Array =>
  writeWorkbook([
    { name: STATIONS_SHEET, rtl: true, headingRows: 1, widths: STATION_WIDTHS, formats: STATION_FORMATS, rows: stationsTemplateRows(), validations: stationValidations(1 + 2 + SPARE_ROWS) },
    { name: 'تعليمات', rtl: true, headingRows: 1, wrap: true, widths: [96], rows: STATION_GUIDE.map((line) => [line]) },
  ])
