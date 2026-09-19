import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { bulkTemplate } from '../backup/bulkReview'
import type { StationDirectory } from '../backup/directory'
import type { BackupCase, ModelOptions } from '../backup/model'
import { saveCsv } from '../exportCsv'
import { fmt } from '../labels'
import { readSheetFile, useBulkEntry } from '../useBulkEntry'
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
const FILE_FAILED = 'تعذّرت قراءة الملف. احفظه من برنامج الجداول بصيغة CSV ثم حاول مرة أخرى.'
const NOTHING_READ = 'لم يُعثر على أسطر. انسخ الخلايا من الجدول والصقها هنا.'

/** Many plans at once: rows pasted from a spreadsheet, or a CSV file, checked on screen before one write saves them all. */
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
      const text = await readSheetFile(file)
      entry.setText(text)
      setProblem(null)
      entry.check(text)
    } catch (error) {
      console.error('bulk entry:', error)
      setProblem(FILE_FAILED)
    }
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
    >
      <header className="rc-dialog__head">
        <div>
          <h2 id="rc-bulk-title">إدخال جماعي لخطط التغذية البديلة</h2>
          <p>{sectorName} · الصق الأسطر من جدولك، أو اختر ملف CSV</p>
        </div>
        <button className="rc-icon-btn" type="button" aria-label="إغلاق" disabled={busy} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="rc-dialog__body">
        {entry.previewing ? (
          entry.reviewed.length > 0 ? (
            <BulkPreview entry={entry} />
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
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                void readFile(e.dataTransfer.files[0])
              }}
            />
            <div className="rc-bulk__sources">
              <label className="rc-btn">
                <Icon name="file" size={15} />
                اختيار ملف <span lang="en">CSV</span>
                <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={(e) => void readFile(e.target.files?.[0])} />
              </label>
              <button className="rc-link" type="button" onClick={() => saveCsv(bulkTemplate(), 'backup-plans-template.csv')}>
                <Icon name="download" size={13} />
                تنزيل نموذج للتعبئة
              </button>
              <small>يمكن أيضاً سحب الملف وإفلاته فوق المربع. ملف الجداول يُحفظ أولاً بصيغة CSV.</small>
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
