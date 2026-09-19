import { Icon } from '../../../components/Icon'
import { FiltersButton } from './FiltersButton'

interface PhoneActionsProps {
  activeFilters: number
  /** The support-only station whose card can be brought back; `null` when none is marked. */
  supportNo: string | null
  /** A panel is open over the page: a press beside it closes it. */
  covered: boolean
  onFilters: () => void
  onSupport: () => void
  /** Present for a signed-in user only. */
  onPlans?: () => void
  onUncover: () => void
}

/** Phones: the panels are sheets over the page, opened from under the map. */
export function PhoneActions({ activeFilters, supportNo, covered, onFilters, onSupport, onPlans, onUncover }: PhoneActionsProps) {
  return (
    <>
      <div className="rc-actions">
        <FiltersButton className="rc-btn" count={activeFilters} onClick={onFilters} />
        <button className="rc-btn" type="button" disabled={!supportNo} onClick={onSupport}>
          <Icon name="activity" size={15} />
          {supportNo ? (
            <>
              تفاصيل{' '}
              <span className="num" dir="ltr">
                {supportNo}
              </span>
            </>
          ) : (
            'اضغط محطة لعرض تفاصيلها'
          )}
        </button>
        {onPlans && (
          <button className="rc-btn rc-actions__wide" type="button" onClick={onPlans}>
            <Icon name="swap" size={15} />
            خطط التغذية البديلة
          </button>
        )}
      </div>
      {covered && <button className="rc-scrim" type="button" aria-label="إغلاق اللوحة" onClick={onUncover} />}
    </>
  )
}
