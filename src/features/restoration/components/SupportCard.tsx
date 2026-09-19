import { Icon } from '../../../components/Icon'
import { loadingLabel, ordinal } from '../backup/format'
import { loadingLevel } from '../backup/model'
import type { PlanNode, SupportLink } from '../backup/planNetwork'
import { fmt } from '../labels'

interface SupportListProps {
  links: SupportLink[]
  /** Opens the plan of the main element of a line. */
  onPlan: (caseId: string) => void
}

/** Every main element a station stands behind: what it would take from each, and where that leaves it. */
export function SupportList({ links, onPlan }: SupportListProps) {
  return (
    <div className="rc-scroll">
      <table className="rc-table rc-table--compact rc-case rc-support">
        <caption className="rc-case__unit">
          القيم بالأمبير <span dir="ltr">(A)</span> — كل حالة على حدة
        </caption>
        <thead>
          <tr>
            <th scope="col">عند فقد</th>
            <th scope="col">الحمل الحالي</th>
            <th scope="col">يستقبل</th>
            <th scope="col">الحمل النهائي</th>
            <th scope="col">نسبة التحميل</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <th scope="row">
                <button className="rc-link rc-case__backup" type="button" title="فتح الخطة" onClick={() => onPlan(link.caseId)}>
                  <i className="rc-case__order" aria-hidden="true">
                    {ordinal(link.order)}
                  </i>
                  <bdi className="num" dir="ltr">
                    {link.mainNo}
                  </bdi>
                </button>
              </th>
              <td className="num">{fmt(link.loadA)}</td>
              <td className="num rc-case__transfer">{fmt(link.transferA)}</td>
              <td className="num">{fmt(link.finalLoadA)}</td>
              <td className="num">
                <span className={`rc-case__loading rc-case__loading--${link.level}`}>{loadingLabel(link.finalLoadingPct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SupportCardProps {
  /** A station that only ever backs others up; `null` closes the panel. */
  node: PlanNode | null
  canAdd: boolean
  onPlan: (caseId: string) => void
  /** Starts a plan of its own for this station. */
  onAddPlan: () => void
  onClose: () => void
}

export function SupportCard({ node, canAdd, onPlan, onAddPlan, onClose }: SupportCardProps) {
  // nothing selected, nothing shown: the map keeps the room
  if (!node) return null
  const ratingA = node.supports[0]?.ratingA ?? 0

  return (
    <aside className="rc-float rc-drawer rc-detail" id="rc-detail" aria-label="تفاصيل المحطة البديلة">
      <header className="rc-drawer__head rc-detail__head">
        <div>
          <h2 className="rc-detail__code num" dir="ltr">
            {node.no}
          </h2>
          <p>{node.name ?? 'بديل فقط — ليست له خطة خاصة به'}</p>
        </div>
        <button className="rc-icon-btn rc-drawer__reset" type="button" aria-label="إغلاق التفاصيل" title="إغلاق" onClick={onClose}>
          <Icon name="close" size={17} />
        </button>
      </header>

      <div className="rc-drawer__body">
        <div className="rc-detail__score">
          <strong className={`num rc-net-loading--${loadingLevel(node.worstPct ?? 0)}`} dir="ltr">
            {loadingLabel(node.worstPct ?? 0)}
          </strong>
          <span>
            أعلى تحميل يصل إليه كبديل
            <span className="rc-chip rc-chip--plain">بديل فقط</span>
          </span>
        </div>

        <dl className="rc-facts">
          <div>
            <dt>الحمل الحالي</dt>
            <dd>
              <span className="num" dir="ltr">
                {fmt(node.loadA)} A <small>· {fmt(node.loadMva, 1)} MVA</small>
              </span>
            </dd>
          </div>
          <div>
            <dt>سعة القاطع المطبّقة</dt>
            <dd className="num" dir="ltr">
              {fmt(ratingA)} A
            </dd>
          </div>
          <div>
            <dt>تحميله الآن</dt>
            <dd className="num" dir="ltr">
              {loadingLabel(node.nowPct ?? 0)}
            </dd>
          </div>
          <div>
            <dt>يقف خلف</dt>
            <dd>
              <span className="num">{fmt(node.supports.length)}</span> {node.supports.length === 1 ? 'عنصر رئيسي' : 'عناصر رئيسية'}
            </dd>
          </div>
        </dl>

        <SupportList links={node.supports} onPlan={onPlan} />

        <p className="rc-assume__note">تُحسب كل حالة فقد على حدة: لو فُقد عنصران رئيسيان معاً فالتحميل أعلى مما يظهر هنا.</p>

        {canAdd && (
          <button className="rc-btn" type="button" onClick={onAddPlan}>
            <Icon name="plus" size={15} />
            إضافة خطة لهذه المحطة
          </button>
        )}
      </div>
    </aside>
  )
}
