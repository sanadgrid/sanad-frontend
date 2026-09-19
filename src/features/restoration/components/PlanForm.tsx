import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { locate, type StationDirectory } from '../backup/directory'
import { ordinal } from '../backup/format'
import { assessCase, type BackupCase, type BackupLevel } from '../backup/model'
import { normalizeQuery } from '../import/stations'
import { CaseFigures, CaseTable } from './CaseTable'
import { NOT_ON_MAP, StationNoField } from './StationNoField'

interface PlanFormProps {
  /** The case being edited; absent for a new one. */
  initial?: BackupCase
  /** The sector's rating, used unless the case names its own. */
  ratingA: number
  directory: StationDirectory
  busy: boolean
  /** Resolves to whether the case was written. */
  onSave: (saved: BackupCase) => Promise<boolean>
  onCancel: () => void
}

interface Row {
  no: string
  load: string
}

const DEFAULT_BACKUPS = 3
const VOLTAGES = [13.8, 33]
const LEVELS: { value: BackupLevel; label: string }[] = [
  { value: 'station', label: 'محطة' },
  { value: 'feeder', label: 'مغذي' },
]

const emptyRow = (): Row => ({ no: '', load: '' })
// digits typed on an Arabic keyboard count too
const numberOf = (text: string) => {
  const value = Number(normalizeQuery(text).replace('٫', '.'))
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null
}
const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `case-${Date.now().toString(36)}`)

function rowsOf(initial: BackupCase | undefined): Row[] {
  const rows = (initial?.backups ?? []).map((b) => ({ no: b.no, load: String(b.loadA) }))
  while (rows.length < DEFAULT_BACKUPS) rows.push(emptyRow())
  return rows
}

/** "Main station X, first backup Y, second backup Z" — with the result worked out while it is typed. */
export function PlanForm({ initial, ratingA, directory, busy, onSave, onCancel }: PlanFormProps) {
  const [id] = useState(() => initial?.id ?? newId())
  const [level, setLevel] = useState<BackupLevel>(initial?.level ?? 'station')
  const [voltageKv, setVoltageKv] = useState(initial?.voltageKv ?? VOLTAGES[0])
  const [main, setMain] = useState<Row>({ no: initial?.main.no ?? '', load: initial ? String(initial.main.loadA) : '' })
  const [backups, setBackups] = useState<Row[]>(() => rowsOf(initial))
  const [rating, setRating] = useState(initial?.ratingA ? String(initial.ratingA) : '')
  const [note, setNote] = useState(initial?.note ?? '')

  const draft = useMemo((): BackupCase => {
    const override = numberOf(rating)
    return {
      id,
      level,
      voltageKv,
      ...(override && { ratingA: override }),
      main: { no: normalizeQuery(main.no), loadA: numberOf(main.load) ?? 0 },
      // a line without a number is a line not used, as a blank cell is in the sheet
      backups: backups.filter((b) => b.no.trim()).map((b) => ({ no: normalizeQuery(b.no), loadA: numberOf(b.load) ?? 0 })),
      ...(note.trim() && { note: note.trim() }),
    }
  }, [id, level, voltageKv, rating, main, backups, note])

  const result = useMemo(() => assessCase(draft, { ratingA }), [draft, ratingA])
  const complete = Boolean(main.no.trim()) && numberOf(main.load) !== null && backups.every((b) => !b.no.trim() || numberOf(b.load) !== null)
  const unknown = (no: string) => Boolean(no.trim()) && !locate(directory, no)
  const setBackup = (index: number, patch: Partial<Row>) => setBackups((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <form
      className="rc-planform"
      onSubmit={async (e) => {
        e.preventDefault()
        if (complete && (await onSave(draft))) onCancel()
      }}
    >
      <div className="rc-field rc-field--split">
        <div>
          <span className="rc-field__label">المستوى</span>
          <div className="rc-segment" role="group" aria-label="المستوى">
            {LEVELS.map((l) => (
              <button key={l.value} type="button" aria-pressed={level === l.value} onClick={() => setLevel(l.value)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="rc-field__label">
            الجهد <span dir="ltr">kV</span>
          </span>
          <div className="rc-segment" role="group" aria-label="الجهد">
            {VOLTAGES.map((kv) => (
              <button key={kv} type="button" className="num" aria-pressed={voltageKv === kv} onClick={() => setVoltageKv(kv)}>
                {kv}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rc-planform__rows">
        <div className="rc-planform__heads" aria-hidden="true">
          <span />
          <span>الرقم</span>
          <span>
            الحمل <span dir="ltr">(A)</span>
          </span>
        </div>

        <div className="rc-planform__row rc-planform__row--main">
          <span className="rc-planform__tag">الرئيسي</span>
          <StationNoField label="رقم العنصر الرئيسي" value={main.no} directory={directory} onChange={(no) => setMain((m) => ({ ...m, no }))} />
          <input
            className="num"
            dir="ltr"
            type="text"
            inputMode="decimal"
            aria-label="حمل العنصر الرئيسي بالأمبير"
            placeholder="0"
            value={main.load}
            onChange={(e) => setMain((m) => ({ ...m, load: e.target.value }))}
          />
          {unknown(main.no) && <p className="rc-planform__flag">{NOT_ON_MAP}</p>}
        </div>

        {backups.map((row, i) => (
          <div className="rc-planform__row" key={i}>
            <span className="rc-planform__tag">
              <i className="rc-case__order" aria-hidden="true">
                {ordinal(i)}
              </i>
              بديل
            </span>
            <StationNoField label={`رقم البديل ${i + 1}`} value={row.no} directory={directory} onChange={(no) => setBackup(i, { no })} />
            <input
              className="num"
              dir="ltr"
              type="text"
              inputMode="decimal"
              aria-label={`حمل البديل ${i + 1} بالأمبير`}
              placeholder="0"
              value={row.load}
              onChange={(e) => setBackup(i, { load: e.target.value })}
            />
            <button
              className="rc-icon-btn rc-icon-btn--small"
              type="button"
              aria-label={`حذف البديل ${i + 1}`}
              title="حذف البديل"
              onClick={() => setBackups((rows) => rows.filter((_, at) => at !== i))}
            >
              <Icon name="close" size={13} />
            </button>
            {unknown(row.no) && <p className="rc-planform__flag">{NOT_ON_MAP}</p>}
          </div>
        ))}

        <button className="rc-link rc-planform__add" type="button" onClick={() => setBackups((rows) => [...rows, emptyRow()])}>
          <Icon name="plus" size={13} />
          إضافة بديل
        </button>
      </div>

      <div className="rc-field rc-field--split">
        <label className="rc-planform__field">
          <span className="rc-field__label">
            سعة القاطع <span dir="ltr">(A)</span> — اختياري
          </span>
          <input
            className="num"
            dir="ltr"
            type="text"
            inputMode="decimal"
            placeholder={String(ratingA)}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          />
        </label>
        <label className="rc-planform__field">
          <span className="rc-field__label">ملاحظة — اختياري</span>
          <input type="text" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <section className="rc-planform__preview" aria-label="النتيجة" aria-live="polite">
        <span className="rc-field__label">النتيجة</span>
        {numberOf(main.load) === null ? (
          <p className="rc-detail__none">تظهر النتيجة هنا أثناء الكتابة: أدخل حمل العنصر الرئيسي ثم بدائله وأحمالها.</p>
        ) : (
          <>
            <CaseFigures result={result} subject={level === 'feeder' ? 'حمل المغذي' : 'حمل المحطة'} />
            {draft.backups.length > 0 && <CaseTable result={result} />}
          </>
        )}
      </section>

      <div className="rc-planform__foot">
        <button className="rc-btn rc-btn--accent" type="submit" disabled={busy || !complete}>
          <Icon name="check" size={15} />
          {initial ? 'حفظ التعديل' : 'حفظ الخطة'}
        </button>
        <button className="rc-btn" type="button" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  )
}
