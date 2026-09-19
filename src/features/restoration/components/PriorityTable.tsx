import { loadingLabel, ratioLabel } from '../backup/format'
import { loadingLevel } from '../backup/model'
import type { CaseRow } from '../backup/planNetwork'
import { fmt, STATUS } from '../labels'

interface PriorityTableProps {
  /** Already sorted and cut to the rows to show. */
  rows: CaseRow[]
  selectedId: string | null
  /** A row is the way to a plan: it is opened and the map moves to it. */
  onSelect: (caseId: string) => void
}

const both = (amps: number, mva: number) => (
  <>
    {fmt(amps)} <small>· {fmt(mva, 1)}</small>
  </>
)

export function PriorityTable({ rows, selectedId, onSelect }: PriorityTableProps) {
  if (rows.length === 0) return <p className="rc-detail__none rc-sheet__empty">لا توجد خطط مطابقة لخيارات التصفية الحالية.</p>

  return (
    <table className="rc-table rc-table--rows">
      <thead>
        <tr>
          <th scope="col">العنصر الرئيسي</th>
          <th scope="col">نسبة الاستعادة</th>
          <th scope="col">المستوى</th>
          <th scope="col">
            <span dir="ltr">kV</span>
          </th>
          <th scope="col">
            الحمل <span dir="ltr">A · MVA</span>
          </th>
          <th scope="col">
            السعة المتاحة <span dir="ltr">A</span>
          </th>
          <th scope="col">
            القابل للاستعادة <span dir="ltr">A</span>
          </th>
          <th scope="col">
            غير القابل للاستعادة <span dir="ltr">A · MVA</span>
          </th>
          <th scope="col">التصنيف</th>
          <th scope="col">البدائل</th>
          <th scope="col">أعلى تحميل لبديل</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ plan, result: r, links, worstBackupPct }) => (
          // the whole row takes the pointer; the button inside keeps it reachable from the keyboard
          <tr key={plan.id} className={plan.id === selectedId ? 'is-selected' : undefined} onClick={() => onSelect(plan.id)}>
            <th scope="row">
              <button className="rc-table__station" type="button" aria-pressed={plan.id === selectedId}>
                <i style={{ background: STATUS[r.status].color }} aria-hidden="true" />
                <span className="num" dir="ltr">
                  {plan.main.no}
                </span>
                {plan.demo && <small className="rc-demo-chip">تجريبي</small>}
              </button>
            </th>
            <td>
              <span className={`rc-meter rc-status--${r.status}`}>
                <i aria-hidden="true">
                  <i style={{ width: `${r.ratio * 100}%` }} />
                </i>
                <b className="num" dir="ltr">
                  {ratioLabel(r.ratio)}
                </b>
              </span>
            </td>
            <td>{plan.level === 'feeder' ? 'مغذي' : 'محطة'}</td>
            <td className="num">{plan.voltageKv}</td>
            <td className="num" dir="ltr">
              {both(r.loadA, r.loadMva)}
            </td>
            <td className="num">{fmt(r.totalSpareA)}</td>
            <td className="num">{fmt(r.restorableA)}</td>
            <td className={`num${r.unrestorableA > 0 ? ' rc-bad' : ''}`} dir="ltr">
              {both(r.unrestorableA, r.unrestorableMva)}
            </td>
            <td>
              <span className={`rc-status-text rc-status--${r.status}`}>{STATUS[r.status].label}</span>
            </td>
            <td className="num">{links.length}</td>
            <td className="num">
              {worstBackupPct === null ? '—' : <span className={`rc-case__loading rc-case__loading--${loadingLevel(worstBackupPct)}`}>{loadingLabel(worstBackupPct)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
