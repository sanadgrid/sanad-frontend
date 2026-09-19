import { Icon } from '../../../components/Icon'
import type { Coverage } from '../backup/planNetwork'
import { CoverageLine } from './KpiCards'

interface EmptyStateProps {
  coverage: Coverage
  /** Admins add plans; everybody else waits for them. */
  canAdd: boolean
  onAdd: () => void
  onPick: () => void
  onBulk: () => void
  onDismiss: () => void
}

/** No plans yet: what the page needs, said once, over a map that stays usable behind it. */
export function EmptyState({ coverage, canAdd, onAdd, onPick, onBulk, onDismiss }: EmptyStateProps) {
  return (
    <section className="rc-float rc-empty" aria-label="لا توجد خطط بعد">
      <button className="rc-icon-btn rc-icon-btn--small rc-empty__close" type="button" aria-label="إخفاء" title="إخفاء" onClick={onDismiss}>
        <Icon name="close" size={15} />
      </button>
      <Icon name="swap" size={26} />
      <h2>{canAdd ? 'أضف أول خطة تغذية بديلة' : 'لا توجد خطط تغذية بديلة بعد'}</h2>
      <p>
        {canAdd
          ? 'تُبنى هذه الصفحة من خطط التغذية البديلة: العنصر الرئيسي وحمله، ثم بدائله بالترتيب وأحمالها. كل خطة تضيفها تظهر على الخريطة وفي المؤشرات فوراً.'
          : 'تُبنى هذه الصفحة من خطط التغذية البديلة التي يضيفها مشرف القطاع. الطبقات المستوردة متاحة على الخريطة من خيارات التصفية.'}
      </p>
      {canAdd && (
        <div className="rc-empty__actions">
          <button className="rc-btn rc-btn--accent" type="button" onClick={onAdd}>
            <Icon name="plus" size={15} />
            إضافة خطة
          </button>
          <button className="rc-btn" type="button" disabled={coverage.imported === 0} onClick={onPick}>
            <Icon name="crosshair" size={15} />
            اختر من الخريطة
          </button>
          <button className="rc-btn" type="button" onClick={onBulk}>
            <Icon name="table" size={15} />
            إدخال جماعي
          </button>
        </div>
      )}
      <p className="rc-empty__coverage">
        <CoverageLine coverage={coverage} />
      </p>
    </section>
  )
}

interface UnplacedNoticeProps {
  unplaced: string[]
  ambiguous: string[]
}

const SHOWN = 6

const numbers = (list: string[]) => (
  <bdi className="num" dir="ltr">
    {list.slice(0, SHOWN).join(' · ')}
    {list.length > SHOWN && ` +${list.length - SHOWN}`}
  </bdi>
)

/** Elements of the plans that the map cannot draw, or may be drawing at the wrong one of several places. */
export function UnplacedNotice({ unplaced, ambiguous }: UnplacedNoticeProps) {
  if (unplaced.length === 0 && ambiguous.length === 0) return null
  return (
    <div className="rc-float rc-unplaced" role="note">
      {unplaced.length > 0 && (
        <p title="أرقام غير موجودة في المحطات المستوردة ولم يُحدَّد لها موقع: محسوبة في المؤشرات، وغير مرسومة">
          <b>بدون موقع</b> {numbers(unplaced)}
        </p>
      )}
      {ambiguous.length > 0 && (
        <p title="أرقام لها أكثر من موقع على الخريطة: مرسومة عند أول موقع إلى أن يُحدَّد الموقع من تعديل الخطة">
          <b>بحاجة إلى تحديد الموقع</b> {numbers(ambiguous)}
        </p>
      )}
    </div>
  )
}
