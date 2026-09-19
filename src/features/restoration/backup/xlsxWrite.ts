import { strToU8, zipSync } from 'fflate'

// An Excel workbook (.xlsx) written from rows of values: a zip of XML parts in
// the order and with the pieces Excel insists on. Numbers stay numbers; the
// heading rows are bold on a light fill and stay in view; a column may carry
// drop-down lists or bounds for what is typed into it. Pure — no I/O.

export type XlsxCell = string | number | null | undefined

/** How the cells of a column show: coordinates with six decimals, or text that is never read as a number. */
export type XlsxFormat = 'coord' | 'text'

export interface XlsxValidation {
  /** The cells it holds to, "A2:A500 C2:C500". */
  sqref: string
  /** `none`: a prompt only, nothing is checked. */
  type: 'list' | 'decimal' | 'whole' | 'none'
  /** A list: the items themselves ("a,b") or a range of cells, on this sheet or another; otherwise a bound. */
  formula1?: string
  formula2?: string
  operator?: 'between' | 'greaterThanOrEqual'
  /** `stop` refuses the value; `warning` says so and lets it through. */
  errorStyle?: 'stop' | 'warning'
  errorTitle?: string
  error?: string
  promptTitle?: string
  prompt?: string
}

export interface XlsxSheet {
  name: string
  rows: XlsxCell[][]
  /** Columns run from the right, as an Arabic sheet does. */
  rtl?: boolean
  /** Rows at the top that are headings: styled, and frozen in place. */
  headingRows?: number
  /** Heading cells from this column on take the second fill: results, not entry. */
  resultsFrom?: number
  /** Column widths in characters. */
  widths?: number[]
  /** By column: how its cells show, blank ones included. */
  formats?: (XlsxFormat | undefined)[]
  /** Rows (from 0) drawn on a soft fill: something about them asks for a look. */
  marked?: ReadonlySet<number>
  /** Long lines of text fold inside their cell. */
  wrap?: boolean
  validations?: XlsxValidation[]
}

export interface XlsxName {
  name: string
  /** "'sheet'!$A$2:$A$9" — see `sheetRef`. */
  ref: string
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CONTENT = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAX_CELL_TEXT = 32_767
// what Excel shows in an alert: longer titles and messages make it repair the file
const MAX_ALERT_TITLE = 32
const MAX_ALERT_TEXT = 255

// cellXfs, by index; the plain one first as the format wants it
const STYLE = { plain: 0, heading: 1, resultHeading: 2, wrapped: 3, marked: 4, coord: 5, markedCoord: 6, text: 7, markedText: 8 }
const COORD_FORMAT = 164
const TEXT_FORMAT = 49
const HEADING_XF = (fill: number) =>
  `<xf numFmtId="0" fontId="1" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
const CELL_XF = (numFmt: number, fill: number) => `<xf numFmtId="${numFmt}" fontId="0" fillId="${fill}" borderId="0" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ''}${fill ? ' applyFill="1"' : ''}/>`
const SOLID = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
const EDGE = (side: string) => `<${side} style="thin"><color rgb="FFB4C0CC"/></${side}>`
const XFS = [
  CELL_XF(0, 0),
  HEADING_XF(2),
  HEADING_XF(3),
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`,
  CELL_XF(0, 4),
  CELL_XF(COORD_FORMAT, 0),
  CELL_XF(COORD_FORMAT, 4),
  CELL_XF(TEXT_FORMAT, 0),
  CELL_XF(TEXT_FORMAT, 4),
]
// the first two fills are fixed by the format; Excel repairs a file without them
const STYLES = `${HEAD}<styleSheet xmlns="${MAIN}"><numFmts count="1"><numFmt numFmtId="${COORD_FORMAT}" formatCode="0.000000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${SOLID('FFDCE9F5')}${SOLID('FFE9ECEF')}${SOLID('FFFFF4D6')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map(EDGE).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${XFS.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

// what XML cannot hold is dropped; "_x0041_" would be read back as an escape, so its underscore is escaped first
const writable = (code: number) => code === 9 || code === 10 || (code >= 32 && (code < 0xd800 || code > 0xdfff) && code !== 0xfffe && code !== 0xffff)
function clean(text: string): string {
  let kept = ''
  // by whole characters: half of a pair, as a cut through an emoji leaves, is dropped with the rest
  for (const char of text.slice(0, MAX_CELL_TEXT)) if (writable(char.codePointAt(0) ?? 0)) kept += char
  return kept.replace(/_(?=x[0-9a-fA-F]{4}_)/g, '_x005F_')
}
// inside an element a quote is itself: a formula reads as written
const escapeText = (text: string) => clean(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeXml = (text: string) => escapeText(text).replace(/"/g, '&quot;')

/** 0 → A, 26 → AA. */
export const columnName = (index: number): string => (index >= 26 ? columnName(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))

/** A sheet's tab: at most 31 characters, and none of [ ] : * ? / \. */
export const sheetTab = (name: string, index = 0) => name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${index + 1}`

/** A range on a named sheet, as a formula names it: `'المحطات'!$A$2:$A$9`. */
export const sheetRef = (name: string, range: string) => `'${sheetTab(name).replace(/'/g, "''")}'!${range}`

const attribute = (name: string, value: string | undefined, max: number) => (value ? ` ${name}="${escapeXml(value.slice(0, max))}"` : '')

function validationXml(v: XlsxValidation): string {
  const alerts = attribute('errorTitle', v.errorTitle, MAX_ALERT_TITLE) + attribute('error', v.error, MAX_ALERT_TEXT) + attribute('promptTitle', v.promptTitle, MAX_ALERT_TITLE) + attribute('prompt', v.prompt, MAX_ALERT_TEXT)
  const shown = `${v.prompt ? ' showInputMessage="1"' : ''}${v.error ? ' showErrorMessage="1"' : ''}`
  const operator = v.operator && v.type !== 'list' ? ` operator="${v.operator}"` : ''
  const formulas = v.type === 'none' ? '' : `<formula1>${escapeText(v.formula1 ?? '')}</formula1>${v.formula2 ? `<formula2>${escapeText(v.formula2)}</formula2>` : ''}`
  return `<dataValidation${v.type === 'none' ? '' : ` type="${v.type}"`}${v.errorStyle && v.errorStyle !== 'stop' ? ` errorStyle="${v.errorStyle}"` : ''}${operator} allowBlank="1"${shown}${alerts} sqref="${escapeXml(v.sqref)}">${formulas}</dataValidation>`
}

const cellStyle = (format: XlsxFormat | undefined, marked: boolean, wrap: boolean | undefined) =>
  format === 'coord' ? (marked ? STYLE.markedCoord : STYLE.coord) : format === 'text' ? (marked ? STYLE.markedText : STYLE.text) : marked ? STYLE.marked : wrap ? STYLE.wrapped : STYLE.plain

function sheetXml(sheet: XlsxSheet, first: boolean, stringId: (text: string) => number): string {
  const headingRows = sheet.headingRows ?? 0
  const width = Math.max(1, ...sheet.rows.map((row) => row.length))
  const rows = sheet.rows.map((cells, r) => {
    const marked = sheet.marked?.has(r) ?? false
    const written = cells.map((cell, c) => {
      const text = typeof cell === 'string' ? cell : ''
      const isNumber = typeof cell === 'number' && Number.isFinite(cell)
      if (!isNumber && !text) return ''
      const style = r < headingRows ? (c >= (sheet.resultsFrom ?? Infinity) ? STYLE.resultHeading : STYLE.heading) : cellStyle(sheet.formats?.[c], marked, sheet.wrap)
      const at = `r="${columnName(c)}${r + 1}"${style ? ` s="${style}"` : ''}`
      return isNumber ? `<c ${at}><v>${cell}</v></c>` : `<c ${at} t="s"><v>${stringId(text)}</v></c>`
    })
    return written.some(Boolean) ? `<row r="${r + 1}">${written.join('')}</row>` : ''
  })

  const below = `A${headingRows + 1}`
  const pane = headingRows > 0 ? `<pane ySplit="${headingRows}" topLeftCell="${below}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${below}" sqref="${below}"/>` : ''
  const view = `<sheetView${sheet.rtl ? ' rightToLeft="1"' : ''}${first ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView>`
  // a column's format is the column's own, so a blank cell typed into later shows the same way
  const columns = Math.max(sheet.widths?.length ?? 0, sheet.formats?.length ?? 0)
  const cols = Array.from({ length: columns }, (_, i) => {
    const w = sheet.widths?.[i]
    const style = sheet.formats?.[i] ? cellStyle(sheet.formats[i], false, false) : 0
    return w || style ? `<col min="${i + 1}" max="${i + 1}"${w ? ` width="${w}" customWidth="1"` : ''}${style ? ` style="${style}"` : ''}/>` : ''
  }).join('')
  const validations = sheet.validations?.length ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map(validationXml).join('')}</dataValidations>` : ''
  // the order of these elements is part of the format
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${RELS}"><dimension ref="A1:${columnName(width - 1)}${Math.max(1, sheet.rows.length)}"/><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows.join('')}</sheetData>${validations}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
}

export function writeWorkbook(sheets: XlsxSheet[], names: XlsxName[] = []): Uint8Array {
  const strings = new Map<string, number>()
  let uses = 0
  const stringId = (text: string) => {
    uses += 1
    const known = strings.get(text)
    if (known !== undefined) return known
    strings.set(text, strings.size)
    return strings.size - 1
  }
  const sheetParts = sheets.map((sheet, i) => sheetXml(sheet, i === 0, stringId))
  const n = sheets.length

  const shared = `${HEAD}<sst xmlns="${MAIN}" count="${uses}" uniqueCount="${strings.size}">${[...strings.keys()].map((text) => `<si><t${/^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : ''}>${escapeXml(text)}</t></si>`).join('')}</sst>`
  const definedNames = names.length > 0 ? `<definedNames>${names.map((d) => `<definedName name="${escapeXml(d.name)}">${escapeText(d.ref)}</definedName>`).join('')}</definedNames>` : ''
  const workbook = `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${RELS}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(sheetTab(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${definedNames}</workbook>`
  const workbookRels = `${HEAD}<Relationships xmlns="${PACKAGE_RELS}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${RELS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${RELS}/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="${RELS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
  const rootRels = `${HEAD}<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const contentTypes = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CONTENT}.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CONTENT}.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="${CONTENT}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CONTENT}.sharedStrings+xml"/></Types>`

  // the content types come first, as every writer of the format puts them
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rootRels),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
      'xl/styles.xml': strToU8(STYLES),
      'xl/sharedStrings.xml': strToU8(shared),
      ...Object.fromEntries(sheetParts.map((xml, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(xml)])),
    },
    { level: 6 },
  )
}
