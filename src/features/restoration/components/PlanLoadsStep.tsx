import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { placesOf, toPosition, type StationDirectory } from '../backup/directory'
import { fillDemoLoads, setRow, toCase, usedBackups, type DraftRow, type PlanDraft, type RowTarget } from '../backup/draft'
import { ordinal } from '../backup/format'
import { assessCase, type BackupCase, type BackupLevel } from '../backup/model'
import { saveBlocker } from '../backup/wizard'
import type { PlanEditor } from '../usePlanEditor'
import { CaseFigures, CaseTable } from './CaseTable'

interface PlanLoadsStepProps {
  editor: PlanEditor
  draft: PlanDraft
  ratingA: number
  directory: StationDirectory
  busy: boolean
  /** Shown instead of the buttons: a question that must be answered first. */
  asking?: ReactNode
  onSave: (saved: BackupCase) => Promise<boolean>
  onBack: () => void
  onCancel: () => void
}

const VOLTAGES = [13.8, 33]
const LEVELS: { value: BackupLevel; label: string }[] = [
  { value: 'station', label: 'محطة' },
  { value: 'feeder', label: 'مغذي' },
]

/** The layer the chosen place belongs to: it tells two stations of one number apart. */
function layerNameOf(directory: StationDirectory, row: DraftRow): string {
  const places = placesOf(directory, row.no)
  const chosen = row.at && places.find((p) => toPosition(p.at).join() === row.at?.join())
  return (chosen || places[0])?.layerName ?? ''
}

/** The last step of a new plan: one load per station, and the result while they are typed. */
export function PlanLoadsStep({ editor, draft, ratingA, directory, busy, asking, onSave, onBack, onCancel }: PlanLoadsStepProps) {
  const { change } = editor
  const form = useRef<HTMLFormElement>(null)
  const backups = usedBackups(draft)
  const saved = useMemo(() => toCase(draft), [draft])
  const result = useMemo(() => assessCase(saved, { ratingA }), [saved, ratingA])
  const blocker = saveBlocker(draft)

  const loads = () => [...(form.current?.querySelectorAll<HTMLInputElement>('[data-load]') ?? [])]

  // the keyboard starts on the first load still missing: no click is needed to begin typing
  useEffect(() => {
    const inputs = [...(form.current?.querySelectorAll<HTMLInputElement>('[data-load]') ?? [])]
    ;(inputs.find((input) => !input.value.trim()) ?? inputs[0])?.focus({ preventScroll: true })
  }, [])

  const save = async () => {
    if (!blocker && !busy && (await onSave(saved))) editor.close()
  }

  // Enter moves down the column like a spreadsheet; on the last load it saves
  const onLoadKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const inputs = loads()
    const next = inputs[inputs.indexOf(event.currentTarget) + 1]
    if (!next) return void save()
    next.focus()
    next.select()
  }

  const line = (target: RowTarget, row: DraftRow, tag: ReactNode, label: string, last: boolean) => (
    <div className={`rc-loads__row${target === 'main' ? ' rc-loads__row--main' : ''}`} key={row.key}>
      <span className="rc-planform__tag">{tag}</span>
      <span className="rc-loads__station">
        <bdi className="num" dir="ltr">
          {row.no}
        </bdi>
        <small>{layerNameOf(directory, row) || 'بدون طبقة'}</small>
      </span>
      <span className="rc-loads__input">
        <input
          className="num"
          dir="ltr"
          type="text"
          inputMode="decimal"
          enterKeyHint={last ? 'done' : 'next'}
          data-load
          aria-label={label}
          placeholder="0"
          value={row.load}
          onKeyDown={onLoadKey}
          onChange={(e) => change((d) => setRow(d, target, (r) => ({ ...r, load: e.target.value })))}
        />
        <span dir="ltr" aria-hidden="true">
          A
        </span>
      </span>
    </div>
  )

  return (
    <form
      className="rc-planform rc-loads"
      ref={form}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="rc-loads__head">
        <p>اكتب الحمل الحالي لكل محطة بالأمبير؛ زر الإدخال ينقلك إلى التالي.</p>
        <button className="rc-link" type="button" onClick={() => change(fillDemoLoads)}>
          <Icon name="bolt" size={13} />
          أحمال تجريبية
        </button>
      </div>

      <div className="rc-loads__rows">
        {line('main', draft.main, 'الرئيسية', 'حمل المحطة الرئيسية بالأمبير', backups.length === 0)}
        {backups.map((row, i) =>
          line(
            draft.backups.indexOf(row),
            row,
            <>
              <i className="rc-case__order" aria-hidden="true">
                {ordinal(i)}
              </i>
              بديل
            </>,
            `حمل البديل ${i + 1} بالأمبير`,
            i === backups.length - 1,
          ),
        )}
      </div>

      <section className="rc-planform__preview" aria-label="النتيجة" aria-live="polite">
        <span className="rc-field__label">النتيجة</span>
        {saved.main.loadA > 0 ? (
          <>
            <CaseFigures result={result} subject={draft.level === 'feeder' ? 'حمل المغذي' : 'حمل المحطة'} />
            <CaseTable result={result} />
          </>
        ) : (
          <p className="rc-detail__none">تظهر هنا نسبة الاستعادة وتحميل كل بديل أثناء الكتابة.</p>
        )}
      </section>

      <details className="rc-loads__more">
        <summary>
          <Icon name="chevronDown" size={14} />
          خيارات إضافية
          <small>
            {draft.level === 'feeder' ? 'مغذي' : 'محطة'} ·{' '}
            <span className="num" dir="ltr">
              {draft.voltageKv} kV
            </span>{' '}
            · سعة القاطع{' '}
            <span className="num" dir="ltr">
              {draft.rating.trim() || ratingA} A
            </span>
          </small>
        </summary>
        <div className="rc-field rc-field--split">
          <div>
            <span className="rc-field__label">المستوى</span>
            <div className="rc-segment" role="group" aria-label="المستوى">
              {LEVELS.map((l) => (
                <button key={l.value} type="button" aria-pressed={draft.level === l.value} onClick={() => change((d) => ({ ...d, level: l.value }))}>
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
                <button key={kv} type="button" className="num" aria-pressed={draft.voltageKv === kv} onClick={() => change((d) => ({ ...d, voltageKv: kv }))}>
                  {kv}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="rc-field rc-field--split">
          <label className="rc-planform__field">
            <span className="rc-field__label">
              سعة القاطع <span dir="ltr">(A)</span>
            </span>
            <input className="num" dir="ltr" type="text" inputMode="decimal" placeholder={String(ratingA)} value={draft.rating} onChange={(e) => change((d) => ({ ...d, rating: e.target.value }))} />
          </label>
          <label className="rc-planform__field">
            <span className="rc-field__label">ملاحظة</span>
            <input type="text" maxLength={140} value={draft.note} onChange={(e) => change((d) => ({ ...d, note: e.target.value }))} />
          </label>
        </div>
        <button className="rc-link" type="button" onClick={editor.toForm}>
          <Icon name="edit" size={13} />
          فتح النموذج الكامل
        </button>
      </details>

      {asking ?? (
        <>
          <p className={`rc-loads__why${blocker ? '' : ' is-ready'}`} id="rc-loads-why" role="status">
            {blocker ?? 'الخطة جاهزة للحفظ.'}
          </p>
          <div className="rc-planform__foot">
            <button className="rc-btn rc-btn--accent" type="submit" disabled={busy || Boolean(blocker)} aria-describedby="rc-loads-why">
              <Icon name="check" size={15} />
              حفظ الخطة
            </button>
            <button className="rc-btn" type="button" onClick={onBack}>
              <Icon name="arrowRight" size={14} />
              السابق
            </button>
            <button className="rc-btn" type="button" onClick={onCancel}>
              إلغاء
            </button>
          </div>
        </>
      )}
    </form>
  )
}
