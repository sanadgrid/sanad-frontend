import { useEffect, useMemo, useRef } from 'react'
import { Icon } from '../../../components/Icon'
import { placeOf, placesOf, type StationDirectory } from '../backup/directory'
import { emptyRow, fillDemoLoads, isComplete, moveBackup, numberOf, setRow, toCase, withNumber, withPlace, type DraftRow, type PlanDraft, type RowTarget } from '../backup/draft'
import { ordinal } from '../backup/format'
import { assessCase, type BackupCase, type BackupLevel } from '../backup/model'
import type { LatLng } from '../types'
import type { PlanEditor } from '../usePlanEditor'
import { CaseFigures, CaseTable } from './CaseTable'
import { PickBar } from './PickBar'
import { PlaceChooser } from './PlaceChooser'
import { NOT_ON_MAP, StationNoField } from './StationNoField'

interface PlanFormProps {
  editor: PlanEditor
  draft: PlanDraft
  /** The sector's rating, used unless the case names its own. */
  ratingA: number
  directory: StationDirectory
  busy: boolean
  /** Resolves to whether the case was written. */
  onSave: (saved: BackupCase) => Promise<boolean>
  /** The stations were picked on the map: it may frame them. */
  onPicked: () => void
  onCancel: () => void
}

const VOLTAGES = [13.8, 33]
const LEVELS: { value: BackupLevel; label: string }[] = [
  { value: 'station', label: 'محطة' },
  { value: 'feeder', label: 'مغذي' },
]

/** "Main station X, first backup Y, second backup Z" — with the result worked out while it is typed. */
export function PlanForm({ editor, draft, ratingA, directory, busy, onSave, onPicked, onCancel }: PlanFormProps) {
  const { picking, change } = editor
  const { level, voltageKv, main, backups } = draft
  const rows = useRef<HTMLDivElement>(null)
  const pickButton = useRef<HTMLButtonElement>(null)
  // where the keyboard goes once the lines have been drawn in their new order
  const focusNext = useRef<string | null>(null)
  const wasPicking = useRef(false)

  useEffect(() => {
    const wanted = focusNext.current
    focusNext.current = null
    if (wanted) rows.current?.querySelector<HTMLButtonElement>(`[data-move="${wanted}"]:not(:disabled)`)?.focus()
  }, [backups])

  // back from the map: the keyboard returns to the button that led there
  useEffect(() => {
    if (wasPicking.current && !picking) pickButton.current?.focus()
    wasPicking.current = picking
  }, [picking])

  const saved = useMemo(() => toCase(draft), [draft])
  const result = useMemo(() => assessCase(saved, { ratingA }), [saved, ratingA])
  const complete = isComplete(draft)
  const hasDirectory = directory.size > 0

  const update = (target: RowTarget, patch: (row: DraftRow) => DraftRow) => change((d) => setRow(d, target, patch))
  const move = (index: number, by: 1 | -1) => {
    const to = index + by
    // the same button of the same line, or its twin when the line has reached an end
    const atEnd = by < 0 ? to === 0 : to === backups.length - 1
    focusNext.current = `${to}:${atEnd ? -by : by}`
    change((d) => moveBackup(d, index, by))
  }

  // distances in the chooser are told from the nearest thing already placed
  const mainAt = placeOf(directory, main)
  const nearOf = (target: RowTarget): { at: LatLng; label: string } | undefined => {
    if (target !== 'main') {
      if (mainAt) return { at: mainAt, label: 'الرئيسي' }
      const before = target > 0 ? placeOf(directory, backups[target - 1]) : null
      return before ? { at: before, label: `البديل ${ordinal(target - 1)}` } : undefined
    }
    const first = backups.findIndex((row) => row.at)
    return first < 0 ? undefined : { at: placeOf(directory, backups[first]) as LatLng, label: `البديل ${ordinal(first)}` }
  }

  const under = (target: RowTarget, row: DraftRow, label: string) => {
    if (!row.no.trim()) return null
    const places = placesOf(directory, row.no)
    if (places.length === 0 && !row.at) return <p className="rc-planform__flag">{NOT_ON_MAP}</p>
    if (places.length < 2) return null
    return (
      <PlaceChooser
        label={label}
        places={places}
        at={row.at}
        near={nearOf(target)}
        onChoose={(place) => update(target, (r) => withPlace(r, place))}
        onHover={editor.setHover}
      />
    )
  }

  return (
    <>
      {picking && (
        <PickBar
          draft={draft}
          onDone={() => {
            editor.finishPicking()
            onPicked()
          }}
          onCancel={editor.cancelPicking}
        />
      )}
      <form
        className="rc-planform"
        hidden={picking}
        onSubmit={async (e) => {
          e.preventDefault()
          if (complete && (await onSave(saved))) onCancel()
        }}
      >
        <div className="rc-field rc-field--split">
          <div>
            <span className="rc-field__label">المستوى</span>
            <div className="rc-segment" role="group" aria-label="المستوى">
              {LEVELS.map((l) => (
                <button key={l.value} type="button" aria-pressed={level === l.value} onClick={() => change((d) => ({ ...d, level: l.value }))}>
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
                <button key={kv} type="button" className="num" aria-pressed={voltageKv === kv} onClick={() => change((d) => ({ ...d, voltageKv: kv }))}>
                  {kv}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rc-planform__quick">
          {hasDirectory && (
            <button className="rc-btn" type="button" ref={pickButton} onClick={editor.startPicking}>
              <Icon name="crosshair" size={15} />
              اختر من الخريطة
            </button>
          )}
          <button className="rc-btn" type="button" onClick={() => change(fillDemoLoads)}>
            <Icon name="bolt" size={15} />
            أحمال تجريبية
          </button>
        </div>

        <div className="rc-planform__rows" ref={rows}>
          <div className="rc-planform__heads" aria-hidden="true">
            <span />
            <span>الرقم</span>
            <span>
              الحمل <span dir="ltr">(A)</span>
            </span>
          </div>

          <div className="rc-planform__row rc-planform__row--main">
            <span className="rc-planform__tag">الرئيسي</span>
            <StationNoField label="رقم العنصر الرئيسي" value={main.no} directory={directory} onChange={(no) => update('main', (r) => withNumber(r, no, directory))} />
            <input
              className="num"
              dir="ltr"
              type="text"
              inputMode="decimal"
              aria-label="حمل العنصر الرئيسي بالأمبير"
              placeholder="0"
              value={main.load}
              onChange={(e) => update('main', (r) => ({ ...r, load: e.target.value }))}
            />
            {under('main', main, 'رقم العنصر الرئيسي')}
          </div>

          {backups.map((row, i) => (
            <div className="rc-planform__row" key={row.key}>
              <span className="rc-planform__tag">
                <i className="rc-case__order" aria-hidden="true">
                  {ordinal(i)}
                </i>
                بديل
              </span>
              <StationNoField label={`رقم البديل ${i + 1}`} value={row.no} directory={directory} onChange={(no) => update(i, (r) => withNumber(r, no, directory))} />
              <input
                className="num"
                dir="ltr"
                type="text"
                inputMode="decimal"
                aria-label={`حمل البديل ${i + 1} بالأمبير`}
                placeholder="0"
                value={row.load}
                onChange={(e) => update(i, (r) => ({ ...r, load: e.target.value }))}
              />
              <span className="rc-planform__acts">
                <button
                  className="rc-icon-btn rc-icon-btn--small"
                  type="button"
                  data-move={`${i}:-1`}
                  aria-label={`تقديم البديل ${i + 1} في الترتيب`}
                  title="تقديم"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <Icon name="chevronUp" size={13} />
                </button>
                <button
                  className="rc-icon-btn rc-icon-btn--small"
                  type="button"
                  data-move={`${i}:1`}
                  aria-label={`تأخير البديل ${i + 1} في الترتيب`}
                  title="تأخير"
                  disabled={i === backups.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <Icon name="chevronDown" size={13} />
                </button>
                <button
                  className="rc-icon-btn rc-icon-btn--small"
                  type="button"
                  aria-label={`حذف البديل ${i + 1}`}
                  title="حذف البديل"
                  onClick={() => change((d) => ({ ...d, backups: d.backups.filter((_, at) => at !== i) }))}
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
              {under(i, row, `رقم البديل ${i + 1}`)}
            </div>
          ))}

          <button className="rc-link rc-planform__add" type="button" onClick={() => change((d) => ({ ...d, backups: [...d.backups, emptyRow()] }))}>
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
              value={draft.rating}
              onChange={(e) => change((d) => ({ ...d, rating: e.target.value }))}
            />
          </label>
          <label className="rc-planform__field">
            <span className="rc-field__label">ملاحظة — اختياري</span>
            <input type="text" maxLength={140} value={draft.note} onChange={(e) => change((d) => ({ ...d, note: e.target.value }))} />
          </label>
        </div>

        <label className="rc-check">
          <input type="checkbox" checked={draft.demo} onChange={(e) => change((d) => ({ ...d, demo: e.target.checked }))} />
          <span>خطة تجريبية</span>
        </label>

        <section className="rc-planform__preview" aria-label="النتيجة" aria-live="polite">
          <span className="rc-field__label">النتيجة</span>
          {numberOf(main.load) === null ? (
            <p className="rc-detail__none">تظهر النتيجة هنا أثناء الكتابة: أدخل حمل العنصر الرئيسي ثم بدائله وأحمالها.</p>
          ) : (
            <>
              <CaseFigures result={result} subject={level === 'feeder' ? 'حمل المغذي' : 'حمل المحطة'} />
              {saved.backups.length > 0 && <CaseTable result={result} />}
            </>
          )}
        </section>

        <div className="rc-planform__foot">
          <button className="rc-btn rc-btn--accent" type="submit" disabled={busy || !complete}>
            <Icon name="check" size={15} />
            {editor.isNew ? 'حفظ الخطة' : 'حفظ التعديل'}
          </button>
          <button className="rc-btn" type="button" onClick={onCancel}>
            إلغاء
          </button>
        </div>
      </form>
    </>
  )
}
