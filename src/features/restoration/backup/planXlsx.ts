import { STATUS } from '../labels'
import { ordinal } from './format'
import { assessCase, DEFAULT_RATING_A, type BackupCase, type ModelOptions } from './model'
import { writeWorkbook, type XlsxCell, type XlsxSheet } from './xlsxWrite'

// The sheet the team fills in, and the plans written out in the same columns:
// what the entry reads first, the worked results after them in a second shade.
// An exported file can be edited in Excel and entered again. Pure.

const ENTRY_TAIL = ['المستوى', 'الجهد', 'السعة', 'ملاحظة']
const TEMPLATE_BACKUPS = 3
const TEMPLATE_NOTE = 'مثال — احذف هذا السطر'
const SHEET_NAME = 'خطط التغذية البديلة'
const LEVEL = { station: 'محطة', feeder: 'مغذي' }

const entryHeader = (backups: number) => ['الرئيسي', 'حمل الرئيسي', ...Array.from({ length: backups }, (_, i) => [`بديل ${ordinal(i)}`, `حمل ${ordinal(i)}`]).flat(), ...ENTRY_TAIL]
const entryWidths = (backups: number) => [13, 13, ...Array.from({ length: backups * 2 }, () => 11), 11, 9, 9, 32]

/** Two made-up lines under the header: what a filled sheet looks like. */
export const templateRows = (): XlsxCell[][] => [
  entryHeader(TEMPLATE_BACKUPS),
  [7001, 320, 7002, 270, 7003, 285, 7004, 260, 'محطة', 13.8, null, TEMPLATE_NOTE],
  [7005, 290, 7006, 250, 7007, 265, null, null, 'مغذي', 13.8, 400, TEMPLATE_NOTE],
]

const GUIDE = [
  'طريقة تعبئة الجدول',
  'الرئيسي: رقم المحطة أو المغذي الرئيسي. حمل الرئيسي: حمله بالأمبير.',
  'بديل ١ وحمل ١: رقم البديل الأول وحمله بالأمبير، ثم بديل ٢ وحمل ٢، بترتيب الاستعانة بها.',
  'لإضافة بدائل أكثر أضف عمودين لكل بديل بعد «حمل ٣»: «بديل ٤» و«حمل ٤»، ثم «بديل ٥» و«حمل ٥» وهكذا.',
  'المستوى: «محطة» أو «مغذي». الخانة الفارغة تعني «محطة».',
  'الجهد: بالكيلوفولت، مثل 13.8 أو 33. الخانة الفارغة تعني 13.8.',
  'السعة: سعة القاطع بالأمبير لهذه الخطة وحدها. اتركها فارغة لتُعتمد سعة القطاع.',
  'ملاحظة: نص اختياري. لا تغيّر أسماء الأعمدة.',
]
const EXAMPLE_LINE = 'احذف سطرَي المثال قبل اختيار الملف في «إدخال جماعي».'
const RESULTS_LINE = 'الأعمدة ذات العناوين الرمادية نتائج محسوبة: تبقى للاطلاع، ولا تُقرأ عند إدخال الملف من جديد.'

const guideSheet = (lines: string[]): XlsxSheet => ({ name: 'تعليمات', rtl: true, headingRows: 1, wrap: true, widths: [96], rows: lines.map((line) => [line]) })

export const templateWorkbook = (): Uint8Array =>
  writeWorkbook([{ name: SHEET_NAME, rtl: true, headingRows: 1, widths: entryWidths(TEMPLATE_BACKUPS), rows: templateRows() }, guideSheet([...GUIDE, EXAMPLE_LINE])])

const round = (value: number, digits = 1) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null)
const pct = (ratio: number) => round(ratio * 100)
// a station number is a number in a sheet, as it is when typed into one
const numberOf = (no: string): XlsxCell => (/^[1-9]\d{0,14}$/.test(no) ? Number(no) : no)

const RESULTS = ['إجمالي المتاح (A)', 'القابل للاستعادة (A)', 'غير القابل للاستعادة (A)', 'نسبة الاستعادة ٪', 'الحالة', 'السعة المعتمدة (A)']
const DERATED = ['معامل التخفيض الحراري', 'نسبة الاستعادة بعد التخفيض ٪', 'غير القابل للاستعادة بعد التخفيض (A)', 'الحالة بعد التخفيض']
const perBackup = (i: number) => [`المتاح في بديل ${ordinal(i)} (A)`, `التحويل إلى بديل ${ordinal(i)} (A)`, `نسبة تحميل بديل ${ordinal(i)} بعد التحويل ٪`]

/** One line per case: the entry columns, the demo mark when any case has it, then the results. */
export function plansRows(cases: BackupCase[], options: ModelOptions, derating: number): { rows: XlsxCell[][]; resultsFrom: number; backups: number } {
  const backups = Math.max(TEMPLATE_BACKUPS, ...cases.map((c) => c.backups.length))
  const withDemo = cases.some((c) => c.demo)
  const pairs = Array.from({ length: backups }, (_, i) => i)
  const entry = [...entryHeader(backups), ...(withDemo ? ['تجريبي'] : [])]
  const header = [...entry, ...RESULTS, ...DERATED, ...pairs.flatMap(perBackup)]

  const lines = cases.map((c): XlsxCell[] => {
    const r = assessCase(c, options)
    const derated = assessCase(c, { ...options, derating })
    return [
      numberOf(c.main.no), c.main.loadA,
      ...pairs.flatMap((i) => (c.backups[i] ? [numberOf(c.backups[i].no), c.backups[i].loadA] : [null, null])),
      LEVEL[c.level], c.voltageKv, c.ratingA ?? null, c.note ?? null,
      ...(withDemo ? [c.demo ? 'نعم' : null] : []),
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

export function plansWorkbook(cases: BackupCase[], options: ModelOptions, derating: number): Uint8Array {
  const { rows, resultsFrom, backups } = plansRows(cases, options, derating)
  const entry = entryWidths(backups)
  const widths = [...entry, ...Array.from({ length: rows[0].length - entry.length }, () => 16)]
  return writeWorkbook([{ name: SHEET_NAME, rtl: true, headingRows: 1, resultsFrom, widths, rows }, guideSheet([...GUIDE, RESULTS_LINE])])
}
