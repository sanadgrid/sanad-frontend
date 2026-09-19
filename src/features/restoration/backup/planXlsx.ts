import { STATUS } from '../labels'
import { elementFloc, type StationDirectory } from './directory'
import { ordinal } from './format'
import { assessCase, DEFAULT_RATING_A, type BackupCase, type BackupElement, type ModelOptions } from './model'
import { placesSheet, stationsSheet } from './stationSheet'
import { columnName, writeWorkbook, type XlsxCell, type XlsxSheet, type XlsxValidation } from './xlsxWrite'

// The sheet the team fills in, and the plans written out in the same columns:
// what the entry reads first, the worked results after them in a second shade.
// The station columns offer the project's stations as a list, drawn from a
// stations sheet of the same workbook. An exported file can be edited in Excel
// and entered again. Pure.

const ENTRY_TAIL = ['المستوى', 'الجهد', 'السعة', 'ملاحظة']
const TEMPLATE_BACKUPS = 5
const TEMPLATE_NOTE = 'مثال — احذف هذا السطر'
const SHEET_NAME = 'خطط التغذية البديلة'
const LEVEL = { station: 'محطة', feeder: 'مغذي' }
/** Rows the template checks what is typed into; an export checks this many past its last plan. */
const CHECKED_ROWS = 500
const SPARE_CHECKED = 200
export const STATION_LIST_NAME = 'StationNumbers'

const entryHeader = (backups: number) => ['الرئيسي', 'حمل الرئيسي', ...Array.from({ length: backups }, (_, i) => [`بديل ${ordinal(i)}`, `حمل ${ordinal(i)}`]).flat(), ...ENTRY_TAIL]
const entryWidths = (backups: number) => [13, 13, ...Array.from({ length: backups * 2 }, () => 11), 11, 9, 9, 32]

/** Two made-up lines under the header: what a filled sheet looks like. */
export const templateRows = (): XlsxCell[][] => [
  entryHeader(TEMPLATE_BACKUPS),
  [7001, 320, 7002, 270, 7003, 285, 7004, 260, null, null, null, null, 'محطة', 13.8, null, TEMPLATE_NOTE],
  [7005, 290, 7006, 250, 7007, 265, null, null, null, null, null, null, 'مغذي', 13.8, 400, TEMPLATE_NOTE],
]

const GUIDE = [
  'طريقة تعبئة الجدول',
  'الرئيسي: رقم المحطة أو المغذي الرئيسي، يُختار من القائمة المنسدلة. حمل الرئيسي: حمله بالأمبير.',
  'بديل ١ وحمل ١: رقم البديل الأول وحمله بالأمبير، ثم بديل ٢ وحمل ٢، بترتيب الاستعانة بها.',
  'لإضافة بدائل أكثر أضف عمودين لكل بديل بعد «حمل ٥»: «بديل ٦» و«حمل ٦» وهكذا.',
  'المستوى: «محطة» أو «مغذي». الخانة الفارغة تعني «محطة».',
  'الجهد: بالكيلوفولت، مثل 13.8 أو 33. الخانة الفارغة تعني 13.8.',
  'السعة: سعة القاطع بالأمبير لهذه الخطة وحدها. اتركها فارغة لتُعتمد سعة القطاع.',
  'ملاحظة: نص اختياري. لا تغيّر أسماء الأعمدة.',
  'ورقة «المحطات»: محطات المشروع التي تعرضها القوائم المنسدلة. لإضافة محطة جديدة اكتب رقمها وإحداثياتها في سطر فارغ منها، فتُضاف إلى الخريطة عند إدخال الملف وتصبح متاحة كرئيسي أو بديل.',
  'FLOCSAP في ورقة «المحطات»: رقم المحطة في نظام SAP، اختياري ويُحفظ نصاً كما هو. الخانة الفارغة لا تمسح رقماً محفوظاً.',
]
const EXAMPLE_LINE = 'احذف سطرَي المثال قبل اختيار الملف في «إدخال جماعي».'
const LIST_LINE = 'الصف الأول للعناوين، والأسطر التي تحته للخطط: سطر لكل خطة.'
const RESULTS_LINE = 'الأعمدة ذات العناوين الرمادية نتائج محسوبة: تبقى للاطلاع، ولا تُقرأ عند إدخال الملف من جديد.'

const guideSheet = (lines: string[]): XlsxSheet => ({ name: 'تعليمات', rtl: true, headingRows: 1, wrap: true, widths: [96], rows: lines.map((line) => [line]) })

/** What may go into the entry columns, down to row `last`: stations from the list, loads as figures, the level and the voltage from their few values. */
export function entryValidations(backups: number, last: number, listRef: string): XlsxValidation[] {
  const range = (column: number) => `${columnName(column)}2:${columnName(column)}${last}`
  const pairs = Array.from({ length: backups }, (_, i) => i)
  const level = 2 + backups * 2
  return [
    { sqref: [0, ...pairs.map((i) => 2 + 2 * i)].map(range).join(' '), type: 'list', formula1: listRef, errorStyle: 'warning', errorTitle: 'رقم المحطة', error: 'رقم غير موجود في محطات المشروع — اختر من القائمة', promptTitle: 'رقم المحطة', prompt: 'اختر رقم المحطة من القائمة' },
    { sqref: [1, ...pairs.map((i) => 3 + 2 * i)].map(range).join(' '), type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0', errorTitle: 'الحمل', error: 'الحمل رقم بالأمبير، مثل 320', promptTitle: 'الحمل', prompt: 'الحمل بالأمبير' },
    { sqref: range(level), type: 'list', formula1: '"محطة,مغذي"', errorTitle: 'المستوى', error: 'اختر «محطة» أو «مغذي»', promptTitle: 'المستوى', prompt: 'محطة أو مغذي' },
    { sqref: range(level + 1), type: 'list', formula1: '"13.8,33"', errorStyle: 'warning', errorTitle: 'الجهد', error: 'الجهد بالكيلوفولت: 13.8 أو 33', promptTitle: 'الجهد', prompt: 'الجهد بالكيلوفولت' },
    { sqref: range(level + 2), type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0', errorTitle: 'السعة', error: 'السعة رقم بالأمبير، مثل 400', promptTitle: 'السعة', prompt: 'سعة القاطع بالأمبير، أو فارغة' },
  ]
}

/** The entry sheet, the stations it lists, the places sheet when a number stands at several, and the guide. */
function workbook(entry: XlsxSheet, backups: number, directory: StationDirectory, guide: string[], last: number): Uint8Array {
  const stations = stationsSheet(directory)
  const places = placesSheet(directory)
  const sheet = { ...entry, validations: entryValidations(backups, last, stations.listRef) }
  return writeWorkbook([sheet, stations.sheet, ...(places ? [places] : []), guideSheet(guide)], [{ name: STATION_LIST_NAME, ref: stations.listRef }])
}

/** The template: with stations to choose from, only the header; without any, two example lines. */
export function templateWorkbook(directory: StationDirectory): Uint8Array {
  const empty = directory.size === 0
  const rows = empty ? templateRows() : [entryHeader(TEMPLATE_BACKUPS)]
  const entry: XlsxSheet = { name: SHEET_NAME, rtl: true, headingRows: 1, widths: entryWidths(TEMPLATE_BACKUPS), rows }
  return workbook(entry, TEMPLATE_BACKUPS, directory, [...GUIDE, empty ? EXAMPLE_LINE : LIST_LINE], CHECKED_ROWS)
}

const round = (value: number, digits = 1) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null)
const pct = (ratio: number) => round(ratio * 100)
// a station number is a number in a sheet, as it is when typed into one
const numberOf = (no: string): XlsxCell => (/^[1-9]\d{0,14}$/.test(no) ? Number(no) : no)

const flocOf = (directory: StationDirectory, element: BackupElement): XlsxCell => elementFloc(directory, element)

const RESULTS = ['إجمالي المتاح (A)', 'القابل للاستعادة (A)', 'غير القابل للاستعادة (A)', 'نسبة الاستعادة ٪', 'الحالة', 'السعة المعتمدة (A)']
const DERATED = ['معامل التخفيض الحراري', 'نسبة الاستعادة بعد التخفيض ٪', 'غير القابل للاستعادة بعد التخفيض (A)', 'الحالة بعد التخفيض']
const perBackup = (i: number) => [`المتاح في بديل ${ordinal(i)} (A)`, `التحويل إلى بديل ${ordinal(i)} (A)`, `نسبة تحميل بديل ${ordinal(i)} بعد التحويل ٪`]
const NO_STATIONS: StationDirectory = new Map()

/** One line per case: the entry columns, the demo mark when any case has it, then the FLOCSAPs and the results. */
export function plansRows(cases: BackupCase[], options: ModelOptions, derating: number, directory: StationDirectory = NO_STATIONS): { rows: XlsxCell[][]; resultsFrom: number; backups: number } {
  const backups = Math.max(TEMPLATE_BACKUPS, ...cases.map((c) => c.backups.length))
  const withDemo = cases.some((c) => c.demo)
  const pairs = Array.from({ length: backups }, (_, i) => i)
  const entry = [...entryHeader(backups), ...(withDemo ? ['تجريبي'] : [])]
  const header = [...entry, 'FLOCSAP الرئيسي', ...pairs.map((i) => `FLOCSAP بديل ${ordinal(i)}`), ...RESULTS, ...DERATED, ...pairs.flatMap(perBackup)]

  const lines = cases.map((c): XlsxCell[] => {
    const r = assessCase(c, options)
    const derated = assessCase(c, { ...options, derating })
    return [
      numberOf(c.main.no), c.main.loadA,
      ...pairs.flatMap((i) => (c.backups[i] ? [numberOf(c.backups[i].no), c.backups[i].loadA] : [null, null])),
      LEVEL[c.level], c.voltageKv, c.ratingA ?? null, c.note ?? null,
      ...(withDemo ? [c.demo ? 'نعم' : null] : []),
      flocOf(directory, c.main), ...pairs.map((i) => (c.backups[i] ? flocOf(directory, c.backups[i]) : null)),
      round(r.totalSpareA), round(r.restorableA), round(r.unrestorableA), pct(r.ratio), STATUS[r.status].label, c.ratingA ?? options.ratingA ?? DEFAULT_RATING_A,
      derating, pct(derated.ratio), round(derated.unrestorableA), STATUS[derated.status].label,
      ...pairs.flatMap((i) => {
        const t = r.transfers[i]
        return t ? [round(t.spareA), round(t.transferA), round(t.finalLoadingPct)] : [null, null, null]
      }),
    ]
  })
  return { rows: [header, ...lines], resultsFrom: entry.length, backups }
}

export function plansWorkbook(cases: BackupCase[], options: ModelOptions, derating: number, directory: StationDirectory = NO_STATIONS): Uint8Array {
  const { rows, resultsFrom, backups } = plansRows(cases, options, derating, directory)
  const entry = entryWidths(backups)
  const widths = [...entry, ...Array.from({ length: rows[0].length - entry.length }, () => 16)]
  const sheet: XlsxSheet = { name: SHEET_NAME, rtl: true, headingRows: 1, resultsFrom, widths, rows }
  return workbook(sheet, backups, directory, [...GUIDE, RESULTS_LINE], Math.max(CHECKED_ROWS, rows.length + SPARE_CHECKED))
}
