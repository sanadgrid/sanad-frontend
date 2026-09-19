import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Icon } from '../../../components/Icon'
import type { StationDirectory } from '../backup/directory'
import type { ReviewedStation, StationBox } from '../backup/stationReview'
import { SheetFileError, type SheetFileFailure } from '../backup/xlsxRead'
import { saveStationsTemplate } from '../exportXlsx'
import { fmt } from '../labels'
import { readSheetFile } from '../useBulkEntry'
import { useStationImport } from '../useStationImport'
import { StationPreview } from './StationPreview'

interface StationImportDialogProps {
  sectorId: string
  sectorName: string
  directory: StationDirectory
  box: StationBox
  busy: boolean
  /** Writes the ticked stations; resolves to whether it went through. */
  onSave: (stations: ReviewedStation[]) => Promise<boolean>
  onClose: () => void
}

const COLUMNS = 'رقم المحطة · FLOCSAP · الاسم · خط العرض · خط الطول · الطبقة'
// the file ending reads left to right inside the Arabic sentence
const XLSX = '⁦.xlsx⁩'
const FILE_PROBLEM: Record<SheetFileFailure, string> = {
  saveAs: `تعذّرت قراءة هذا الملف. افتحه في Excel واحفظه من «حفظ باسم» بصيغة ${XLSX} ثم اختره مرة أخرى.`,
  notSheet: `هذا الملف ليس جدولاً. اختر ملف Excel بصيغة ${XLSX} أو ملف CSV.`,
  tooBig: 'الملف أكبر من 10 ميغابايت. انسخ أسطر المحطات إلى ملف Excel جديد ثم اختره.',
  tooManyRows: 'في الورقة أكثر من 20,000 سطر. وزّعها على أكثر من ملف وأدخل كل ملف على حدة.',
}
const NOTHING_READ = 'لم يُعثر على أسطر. انسخ الخلايا من الجدول والصقها هنا.'
const NOTHING_IN_FILE = 'لم يُعثر على أسطر في هذا الملف.'
const TEMPLATE_NAME = 'نموذج-المحطات.xlsx'

/** Stations by the sheet: an Excel or CSV file, or rows pasted from a spreadsheet, checked on screen before they become a layer of the map. */
export function StationImportDialog({ sectorId, sectorName, directory, box, busy, onSave, onClose }: StationImportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const entry = useStationImport(directory, box, sectorId)
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  // a modal <dialog> brings the focus trap, the Esc key and the backdrop with it
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const readFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const read = await readSheetFile(file)
      if (read.kind === 'book' && read.sheets.length === 0 && read.stationSheets.length === 0) return setProblem(NOTHING_IN_FILE)
      setProblem(null)
      entry.checkFile(read)
    } catch (error) {
      console.warn('station import:', error)
      setProblem(FILE_PROBLEM[error instanceof SheetFileError ? error.reason : 'saveAs'])
    }
  }
  const dropped = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setOver(false)
    if (!entry.previewing && !busy) void readFile(event.dataTransfer.files[0])
  }
  const check = () => {
    if (!entry.text.trim()) return setProblem(NOTHING_READ)
    setProblem(null)
    entry.check()
  }

  return (
    <dialog
      className="rc-dialog rc-bulk rc-stations"
      ref={dialog}
      aria-labelledby="rc-stations-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (!entry.previewing) setOver(true)
      }}
      onDragLeave={(event) => event.currentTarget === event.target && setOver(false)}
      onDrop={dropped}
    >
      <header className="rc-dialog__head">
        <div>
          <h2 id="rc-stations-title">
            استيراد محطات من <span lang="en">Excel</span>
          </h2>
          <p>
            {sectorName} · اختر ملف <span lang="en">Excel</span>، أو الصق الأسطر من جدولك
          </p>
        </div>
        <button className="rc-icon-btn" type="button" aria-label="إغلاق" disabled={busy} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="rc-dialog__body">
        {entry.previewing ? (
          entry.reviewed.length > 0 ? (
            <>
              {entry.book && entry.book.sheets.length > 1 && (
                <label className="rc-select rc-select--inline rc-bulk__sheet">
                  <span>الورقة:</span>
                  <select value={entry.book.chosen} onChange={(e) => entry.pickSheet(Number(e.target.value))}>
                    {entry.book.sheets.map((sheet, i) => (
                      <option key={i} value={i}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <StationPreview rows={entry} outsideSwitch />
            </>
          ) : (
            <p className="rc-import__error" role="alert">
              <Icon name="alert" size={16} />
              {NOTHING_READ}
            </p>
          )
        ) : (
          <>
            <p className="rc-bulk__format">
              <b>ترتيب الأعمدة:</b> <span>{COLUMNS}</span>
              <small>
                سطر العناوين اختياري (بالعربية أو الإنجليزية) وبه يمكن ترتيب الأعمدة كما تشاء؛ بدونه تُقرأ الأعمدة الأربعة الأولى: الرقم، الاسم، خط العرض، خط الطول.
                الإحداثيات بالدرجات العشرية، وتُقبل الأرقام العربية. المحطة الموجودة بالموقع نفسه تُتجاوز، والموجودة بموقع آخر تُضاف موقعاً إضافياً لها. الطبقة الفارغة
                تعني «محطات مضافة يدوياً».
              </small>
            </p>
            <textarea
              className={`rc-bulk__paste num${over ? ' is-over' : ''}`}
              dir="ltr"
              rows={9}
              spellCheck={false}
              aria-label="الأسطر الملصقة من الجدول"
              placeholder={'7001\tS/S 7001\t24.7136\t46.6753'}
              value={entry.text}
              onChange={(e) => entry.setText(e.target.value)}
            />
            <div className="rc-bulk__sources">
              <label className="rc-btn">
                <Icon name="file" size={15} />
                اختيار ملف <span lang="en">Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    void readFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="rc-link" type="button" onClick={() => saveStationsTemplate(TEMPLATE_NAME)}>
                <Icon name="download" size={13} />
                تنزيل نموذج <span lang="en">Excel</span> للتعبئة
              </button>
              <small>
                يمكنك سحب ملف <span lang="en">Excel</span> وإفلاته هنا. ملف «تصدير المحطات» يُقبل كما هو: ما فيه من محطات معروفة يُتجاوز.
              </small>
            </div>
            {problem && (
              <p className="rc-import__error" role="alert">
                <Icon name="alert" size={16} />
                {problem}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="rc-dialog__foot">
        {entry.previewing ? (
          <>
            <button className="rc-btn" type="button" disabled={busy} onClick={entry.back}>
              رجوع للتعديل
            </button>
            <button
              className="rc-btn rc-btn--accent"
              type="button"
              disabled={busy || entry.selected.length === 0}
              onClick={async () => {
                if (await onSave(entry.selected)) onClose()
              }}
            >
              <Icon name="check" size={15} />
              حفظ <span className="num">{fmt(entry.selected.length)}</span> محطة
            </button>
          </>
        ) : (
          <button className="rc-btn rc-btn--accent" type="button" onClick={check}>
            معاينة قبل الحفظ
          </button>
        )}
        <button className="rc-btn" type="button" disabled={busy} onClick={onClose}>
          إلغاء
        </button>
      </footer>
    </dialog>
  )
}
