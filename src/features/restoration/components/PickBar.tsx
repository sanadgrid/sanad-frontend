import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { MANY_BACKUPS, nextTarget, usedBackups, type PlanDraft } from '../backup/draft'
import { ordinal } from '../backup/format'

interface PickBarProps {
  draft: PlanDraft
  /** The steps of a plan written step by step, above the question. */
  steps?: ReactNode
  /** Another way to a station than finding its square: by its number. */
  find?: ReactNode
  /** Shown instead of the buttons: a question that must be answered first. */
  asking?: ReactNode
  onDone: () => void
  onCancel: () => void
}

/** The form, while the stations are being clicked on the map: what the next click sets, and what has been set. */
export function PickBar({ draft, steps, find, asking, onDone, onCancel }: PickBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  const cancel = useRef(onCancel)
  useEffect(() => {
    cancel.current = onCancel
  }, [onCancel])

  useEffect(() => {
    // the page is about to bring the map into view: the focus must not scroll it elsewhere
    bar.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const target = nextTarget(draft)
  const backups = usedBackups(draft)
  const ready = Boolean(draft.main.no.trim()) && backups.length > 0
  const many = backups.length > MANY_BACKUPS

  return (
    <div className="rc-pickbar" ref={bar} tabIndex={-1} role="group" aria-label="اختيار محطات الخطة من الخريطة">
      {steps}
      <p className="rc-pickbar__ask" aria-live="polite">
        <Icon name="crosshair" size={16} />
        {target === 'main' ? 'اضغط على المحطة الرئيسية' : `اضغط على البديل ${ordinal(target)}`}
      </p>
      {find}

      {(draft.main.no.trim() || backups.length > 0) && (
        <ul className="rc-pickbar__picked" aria-label="ما تم اختياره">
          {draft.main.no.trim() && (
            <li className="rc-pickbar__main">
              <i aria-hidden="true" />
              <span className="rc-sr">الرئيسي</span>
              <bdi className="num" dir="ltr">
                {draft.main.no}
              </bdi>
            </li>
          )}
          {backups.map((row, i) => (
            <li key={row.key}>
              <i className="rc-case__order" aria-hidden="true">
                {ordinal(i)}
              </i>
              <span className="rc-sr">البديل {i + 1}</span>
              <bdi className="num" dir="ltr">
                {row.no}
              </bdi>
            </li>
          ))}
        </ul>
      )}

      <p className={`rc-pickbar__hint${many ? ' is-warn' : ''}`}>
        {many
          ? `أكثر من ${MANY_BACKUPS} بدائل — راجع ترتيبها قبل الحفظ.`
          : ready
            ? 'الضغط على محطة مختارة يزيلها من الخطة.'
            : 'اختر المحطة الرئيسية ثم بديلاً واحداً على الأقل.'}
      </p>

      {asking ?? (
        <div className="rc-pickbar__foot">
          <button className="rc-btn rc-btn--accent" type="button" disabled={!ready} onClick={onDone}>
            <Icon name="check" size={15} />
            تم
          </button>
          <button className="rc-btn" type="button" onClick={onCancel}>
            إلغاء
          </button>
        </div>
      )}
    </div>
  )
}
