import { useState } from 'react'
import { figureOf } from '../backup/figure'
import { fmt, MONTHS_AR } from '../labels'
import type { Assumptions } from '../usePlanNetwork'
import { Toggle } from './Toggle'

interface AssumptionsView {
  assumptions: Assumptions
  /** The rating in use, and the one the sector has saved. */
  ratingA: number
  savedRatingA: number
  /** The derating of the chosen month, whether applied or not. */
  monthDerating: number
}

const factor = (value: number) => `× ${value.toFixed(2)}`
const MIN_RATING_A = 50

/** The assumptions in force, small, beside the title: a press opens where they are changed. */
export function AssumptionChips({ assumptions, ratingA, savedRatingA, monthDerating, onOpen }: AssumptionsView & { onOpen: () => void }) {
  return (
    <button className="rc-assumed" type="button" title="افتراضات الحساب — اضغط للتغيير" onClick={onOpen}>
      <span className={ratingA !== savedRatingA ? 'is-trial' : undefined}>
        سعة القاطع{' '}
        <b className="num" dir="ltr">
          {fmt(ratingA)} A
        </b>
        {ratingA !== savedRatingA && ' · تجربة'}
      </span>
      {assumptions.deratingOn ? (
        <span className="is-on">
          تخفيض حراري{' '}
          <b className="num" dir="ltr">
            {factor(monthDerating)}
          </b>{' '}
          · {MONTHS_AR[assumptions.month]}
        </span>
      ) : (
        <span>بدون تخفيض حراري</span>
      )}
    </button>
  )
}

interface AssumptionsFieldProps extends AssumptionsView {
  /** Admins may keep the rating being tried as the sector's own. */
  canSave: boolean
  busy: boolean
  onChange: (patch: Partial<Assumptions>) => void
  /** Resolves to whether the rating was written. */
  onSaveRating: (ratingA: number) => Promise<boolean>
}

/** The switch and the rating that re-assess every plan at once. Changing them reads nothing. */
export function AssumptionsField({ assumptions, ratingA, savedRatingA, monthDerating, canSave, busy, onChange, onSaveRating }: AssumptionsFieldProps) {
  // what is being typed; `null` while the field shows the rating in use
  const [typed, setTyped] = useState<string | null>(null)
  const trial = ratingA !== savedRatingA

  const type = (text: string) => {
    setTyped(text)
    const value = figureOf(text)
    // "3" on the way to "348" is not a rating: the page must not flash red while it is typed
    if (value && value >= MIN_RATING_A) onChange({ ratingA: value === savedRatingA ? null : value })
  }

  return (
    <fieldset className="rc-field rc-assumptions">
      <legend className="rc-field__label">افتراضات الحساب</legend>
      <Toggle label="تطبيق التخفيض الحراري" checked={assumptions.deratingOn} onChange={(deratingOn) => onChange({ deratingOn })} />
      <label className="rc-select">
        <span>شهر التخفيض</span>
        <select value={assumptions.month} onChange={(e) => onChange({ month: Number(e.target.value) })}>
          {MONTHS_AR.map((month, i) => (
            <option key={month} value={i}>
              {month}
            </option>
          ))}
        </select>
      </label>
      <small className="rc-assume__note">
        {monthDerating < 1 ? (
          <>
            معامل {MONTHS_AR[assumptions.month]}:{' '}
            <span className="num" dir="ltr">
              {factor(monthDerating)}
            </span>{' '}
            من سعة القاطع{assumptions.deratingOn ? '' : ' — غير مطبَّق الآن'}
          </>
        ) : (
          <>لا تخفيض حراري في {MONTHS_AR[assumptions.month]}.</>
        )}
      </small>

      <div className="rc-assumptions__rating">
        <label htmlFor="rc-rating">
          سعة القاطع المعتمدة <span dir="ltr">(A)</span>
        </label>
        <input
          id="rc-rating"
          className="num"
          dir="ltr"
          type="text"
          inputMode="decimal"
          value={typed ?? String(ratingA)}
          onChange={(e) => type(e.target.value)}
          onBlur={() => setTyped(null)}
        />
      </div>
      {trial && (
        <p className="rc-assumptions__trial">
          <span>
            تجربة — المحفوظة للقطاع{' '}
            <b className="num" dir="ltr">
              {fmt(savedRatingA)} A
            </b>
          </span>
          {canSave && (
            <button
              className="rc-link"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onSaveRating(ratingA)) onChange({ ratingA: null })
              }}
            >
              حفظ للقطاع
            </button>
          )}
          <button className="rc-link" type="button" onClick={() => onChange({ ratingA: null })}>
            استعادة
          </button>
        </p>
      )}
    </fieldset>
  )
}
