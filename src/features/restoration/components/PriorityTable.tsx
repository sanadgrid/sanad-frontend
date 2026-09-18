import type { StationRow } from '../filters'
import { fmt, STATUS } from '../labels'

interface PriorityTableProps {
  /** Already sorted and cut to the rows to show. */
  rows: StationRow[]
  selectedId: string | null
  /** A row is the way to a station: it is selected and the map moves to it. */
  onSelect: (stationId: string) => void
}

const yesNo = (ok: boolean) => <span className={ok ? 'rc-ok' : 'rc-bad'}>{ok ? 'محقق' : 'غير محقق'}</span>

export function PriorityTable({ rows, selectedId, onSelect }: PriorityTableProps) {
  if (rows.length === 0) return <p className="rc-detail__none rc-sheet__empty">لا توجد محطات مطابقة لخيارات التصفية الحالية.</p>

  return (
    <table className="rc-table rc-table--rows">
      <thead>
        <tr>
          <th scope="col">المحطة</th>
          <th scope="col">قدرة الاستعادة</th>
          <th scope="col">المنطقة</th>
          <th scope="col">الإدارة</th>
          <th scope="col">
            النوع · <span dir="ltr">kV</span>
          </th>
          <th scope="col">
            الحمل <span dir="ltr">MVA</span>
          </th>
          <th scope="col">
            السعة المؤكدة <span dir="ltr">MVA</span>
          </th>
          <th scope="col">عن بُعد</th>
          <th scope="col">
            غير مستعاد <span dir="ltr">MW</span>
          </th>
          <th scope="col">مشتركون معرضون</th>
          <th scope="col">حساسون</th>
          <th scope="col">
            <span dir="ltr">VIP</span>
          </th>
          <th scope="col">
            <span dir="ltr">N-1</span>
          </th>
          <th scope="col">
            تغذية مؤقتة <span dir="ltr">MVA</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ station: s, assessment: a }) => (
          // the whole row takes the pointer; the button inside keeps it reachable from the keyboard
          <tr key={s.id} className={s.id === selectedId ? 'is-selected' : undefined} onClick={() => onSelect(s.id)}>
            <th scope="row">
              <button className="rc-table__station" type="button" aria-pressed={s.id === selectedId}>
                <i style={{ background: STATUS[a.status].color }} aria-hidden="true" />
                <span className="num" dir="ltr">
                  {s.code}
                </span>
                <small>{s.district}</small>
              </button>
            </th>
            <td>
              <span className={`rc-meter rc-status--${a.status}`}>
                <i aria-hidden="true">
                  <i style={{ width: `${a.capacityPct}%` }} />
                </i>
                <b className="num" dir="ltr">
                  {a.capacityPct}%
                </b>
              </span>
            </td>
            <td className="num" dir="ltr">
              {s.areaId}
            </td>
            <td>{s.department ?? '—'}</td>
            <td className="num" dir="ltr">
              {s.type} · {s.voltageKv}
            </td>
            <td className="num">{fmt(a.loadMva, 1)}</td>
            <td className="num">{fmt(a.firmCapacityMva)}</td>
            <td className="num" dir="ltr">
              {a.remotePct}%
            </td>
            <td className="num">{fmt(a.unrestoredMw, 1)}</td>
            <td className="num">{fmt(a.customersAtRisk)}</td>
            <td className="num">{s.sensitiveCustomers.length}</td>
            <td className="num">{s.vipCustomers.length}</td>
            <td>{yesNo(a.n1)}</td>
            <td className="num">{s.temporarySupplyMva > 0 ? fmt(s.temporarySupplyMva) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
