import { strToU8, zipSync } from 'fflate'

// An Excel workbook (.xlsx) written from rows of values: a zip of XML parts in
// the order and with the pieces Excel insists on. Numbers stay numbers; the
// heading rows are bold on a light fill and stay in view. Pure — no I/O.

export type XlsxCell = string | number | null | undefined

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
  /** Long lines of text fold inside their cell. */
  wrap?: boolean
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CONTENT = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAX_CELL_TEXT = 32_767

const STYLE = { plain: 0, heading: 1, resultHeading: 2, wrapped: 3 }
const HEADING_XF = (fill: number) =>
  `<xf numFmtId="0" fontId="1" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
const SOLID = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
const EDGE = (side: string) => `<${side} style="thin"><color rgb="FFB4C0CC"/></${side}>`
// the first two fills are fixed by the format; Excel repairs a file without them
const STYLES = `${HEAD}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${SOLID('FFDCE9F5')}${SOLID('FFE9ECEF')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map(EDGE).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${HEADING_XF(2)}${HEADING_XF(3)}<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

// what XML cannot hold is dropped; "_x0041_" would be read back as an escape, so its underscore is escaped first
const writable = (code: number) => code === 9 || code === 10 || (code >= 32 && (code < 0xd800 || code > 0xdfff) && code !== 0xfffe && code !== 0xffff)
function clean(text: string): string {
  let kept = ''
  // by whole characters: half of a pair, as a cut through an emoji leaves, is dropped with the rest
  for (const char of text.slice(0, MAX_CELL_TEXT)) if (writable(char.codePointAt(0) ?? 0)) kept += char
  return kept.replace(/_(?=x[0-9a-fA-F]{4}_)/g, '_x005F_')
}
const escapeXml = (text: string) => clean(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 0 → A, 26 → AA. */
export const columnName = (index: number): string => (index >= 26 ? columnName(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26))

// a sheet's tab: at most 31 characters, and none of [ ] : * ? / \
const tabName = (name: string, index: number) => name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${index + 1}`

function sheetXml(sheet: XlsxSheet, first: boolean, stringId: (text: string) => number): string {
  const headingRows = sheet.headingRows ?? 0
  const width = Math.max(1, ...sheet.rows.map((row) => row.length))
  const rows = sheet.rows.map((cells, r) => {
    const written = cells.map((cell, c) => {
      const text = typeof cell === 'string' ? cell : ''
      const isNumber = typeof cell === 'number' && Number.isFinite(cell)
      if (!isNumber && !text) return ''
      const style = r < headingRows ? (c >= (sheet.resultsFrom ?? Infinity) ? STYLE.resultHeading : STYLE.heading) : sheet.wrap ? STYLE.wrapped : STYLE.plain
      const at = `r="${columnName(c)}${r + 1}"${style ? ` s="${style}"` : ''}`
      return isNumber ? `<c ${at}><v>${cell}</v></c>` : `<c ${at} t="s"><v>${stringId(text)}</v></c>`
    })
    return written.some(Boolean) ? `<row r="${r + 1}">${written.join('')}</row>` : ''
  })

  const below = `A${headingRows + 1}`
  const pane = headingRows > 0 ? `<pane ySplit="${headingRows}" topLeftCell="${below}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${below}" sqref="${below}"/>` : ''
  const view = `<sheetView${sheet.rtl ? ' rightToLeft="1"' : ''}${first ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView>`
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  // the order of these elements is part of the format
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${RELS}"><dimension ref="A1:${columnName(width - 1)}${Math.max(1, sheet.rows.length)}"/><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows.join('')}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
}

export function writeWorkbook(sheets: XlsxSheet[]): Uint8Array {
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
  const workbook = `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${RELS}"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${escapeXml(tabName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
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
