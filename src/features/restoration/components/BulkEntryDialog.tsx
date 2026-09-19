import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Icon } from '../../../components/Icon'
import type { StationDirectory } from '../backup/directory'
import type { BackupCase, ModelOptions } from '../backup/model'
import { templateWorkbook } from '../backup/planXlsx'
import { SheetFileError, type SheetFileFailure } from '../backup/xlsxRead'
import { saveXlsx } from '../exportXlsx'
import { fmt } from '../labels'
import { readSheetFile, useBulkEntry, type BulkEntry } from '../useBulkEntry'
import { BulkPreview } from './BulkPreview'

interface BulkEntryDialogProps {
  sectorName: string
  existing: BackupCase[]
  directory: StationDirectory
  /** The rating and derating the preview is worked out under: the ones the page shows. */
  options: ModelOptions
  busy: boolean
  /** Everything in one write; resolves to whether it went through. */
  onSave: (cases: BackupCase[]) => Promise<boolean>
  onClose: () => void
}

const COLUMNS = 'الرئيسي · حمل الرئيسي · بديل ١ · حمل ١ · بديل ٢ · حمل ٢ · بديل ٣ · حمل ٣ …'
// the file ending reads left to right inside the Arabic sentence
const XLSX = '\u2066.xlsx\u2069'
const FILE_PROBLEM: Record<SheetFileFailure, string> = {
  saveAs: `تعذّرت قراءة هذا الملف. افتحه في Excel واحفظه من «حفظ باسم» بصيغة ${XLSX} ثم اختره مرة أخرى.`,
  notSheet: `هذا الملف ليس جدولاً. اختر ملف Excel بصيغة ${XLSX} أو ملف CSV.`,
  tooBig: 'الملف أكبر من 10 ميغابايت. انسخ أسطر الخطط إلى ملف Excel جديد ثم اختره.',
  tooManyRows: 'في الورقة أكثر من 20,000 سطر. وزّعها على أكثر من ملف وأدخل كل ملف على حدة.',
}
const NOTHING_READ = 'لم يُعثر على أسطر. انسخ الخلايا من الجدول والصقها هنا.'
const NOTHING_IN_FILE = 'لم يُعثر على أسطر في هذا الملف.'
const TEMPLATE_NAME = 'نموذج-خطط-التغذية-البديلة.xlsx'

/** Which sheet of the workbook the preview shows; with several that can hold plans, another may be chosen. */
function SheetChoice({ book, onPick }: { book: NonNullable<BulkEntry['book']>; onPick: (index: number) => void }) {
  if (book.sheets.length < 2)
    return (
      <p className="rc-bulk__sheet">
        الورقة: <b>{book.sheets[book.chosen]?.name}</b>
      </p>
    )
  return (
    <label className="rc-select rc-select--inline rc-bulk__sheet">
      <span>الورقة:</span>
      <select value={book.chosen} onChange={(e) => onPick(Number(e.target.value))}>
        {book.sheets.map((sheet, i) => (
          <option key={i} value={i}>
            {sheet.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Many plans at once: an Excel or CSV file, or rows pasted from a spreadsheet, checked on screen before one write saves them all. */
export function BulkEntryDialog({ sectorName, existing, directory, options, busy, onSave, onClose }: BulkEntryDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const entry = useBulkEntry(existing, directory, options)
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
      if (read.kind === 'book' && read.sheets.length === 0) return setProblem(NOTHING_IN_FILE)
      setProblem(null)
      entry.checkFile(read)
    } catch (error) {
      console.warn('bulk entry:', error)
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
      className="rc-dialog rc-bulk"
      ref={dialog}
      aria-labelledby="rc-bulk-title"
      onCancel={(event) => {
        // not while the plans are being written
        event.preventDefault()
        if (!busy) onClose()
      }}
      // a file let go anywhere on the dialog is read, rather than opened in place of the page
      onDragOver={(event) => {
        event.preventDefault()
        if (!entry.previewing) setOver(true)
      }}
      onDragLeave={(event) => event.currentTarget === event.target && setOver(false)}
      onDrop={dropped}
    >
      <header className="rc-dialog__head">
        <div>
          <h2 id="rc-bulk-title">إدخال جماعي لخطط التغذية البديلة</h2>
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
              {entry.book && <SheetChoice book={entry.book} onPick={entry.pickSheet} />}
              <BulkPreview entry={entry} />
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
                سطر العناوين اختياري (بالعربية أو الإنجليزية)، ومعه يمكن إضافة أعمدة «المستوى» و«الجهد» و«السعة» و«ملاحظة». الأحمال بالأمبير، وتُقبل
                الأرقام العربية وفواصل الآلاف. بدون عناوين: المستوى «محطة» والجهد <span dir="ltr">13.8 kV</span>.
              </small>
            </p>
            <textarea
              className={`rc-bulk__paste num${over ? ' is-over' : ''}`}
              dir="ltr"
              rows={9}
              spellCheck={false}
              aria-label="الأسطر الملصقة من الجدول"
              placeholder={'7001\t320\t7002\t270\t7003\t285'}
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
                    // the same file can be chosen again after it is corrected
                    e.target.value = ''
                  }}
                />
              </label>
              <button className="rc-link" type="button" onClick={() => saveXlsx(templateWorkbook(), TEMPLATE_NAME)}>
                <Icon name="download" size={13} />
                تنزيل نموذج <span lang="en">Excel</span> للتعبئة
              </button>
              <small>
                يمكنك سحب ملف <span lang="en">Excel</span> وإفلاته هنا، أو لصق الصفوف منسوخة من الجدول مباشرة. تُقبل أيضاً ملفات <span lang="en">CSV</span>.
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
              disabled={busy || entry.toSave.length === 0}
              onClick={async () => {
                if (await onSave(entry.toSave)) onClose()
              }}
            >
              <Icon name="check" size={15} />
              حفظ <span className="num">{fmt(entry.totals.count)}</span> خطة
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
