import { Icon } from '../../../components/Icon'
import type { StationRow } from '../filters'
import { fmt, STATUS } from '../labels'

interface PriorityTableProps {
  /** Already sorted and cut to the rows to show. */
  rows: StationRow[]
  /** How many stations match the filters (the CSV holds all of them). */
  visibleCount: number
  selectedId: string | null
  onSelect: (stationId: string) => void
  onExport: () => void
}

const yesNo = (ok: boolean) => <span className={ok ? 'rc-ok' : 'rc-bad'}>{ok ? 'محقق' : 'غير محقق'}</span>

export function PriorityTable({ rows, visibleCount, selectedId, onSelect, onExport }: PriorityTableProps) {
  return (
    <section className="rc-panel rc-priority" aria-labelledby="rc-priority-title">
      <header className="rc-priority__head">
        <div>
          <h2 className="rc-section-title" id="rc-priority-title">
            أولويات التعزيز
          </h2>
          <p>
            أضعف <span className="num">{fmt(rows.length)}</span> محطات من أصل{' '}
            <span className="num">{fmt(visibleCount)}</span> ظاهرة — مرتبة بقدرة الاستعادة ثم بالحمل غير المستعاد.
          </p>
        </div>
        <button className="rc-btn" type="button" onClick={onExport} disabled={visibleCount === 0}>
          <Icon name="download" size={15} />
          تصدير <span lang="en">CSV</span>
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="rc-detail__none">لا توجد محطات مطابقة لخيارات التصفية الحالية.</p>
      ) : (
        <div className="rc-scroll">
          <table className="rc-table">
            <thead>
              <tr>
                <th scope="col">المحطة</th>
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
                <th scope="col">قدرة الاستعادة</th>
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
                <tr key={s.id} className={s.id === selectedId ? 'is-selected' : undefined}>
                  <th scope="row">
                    <button
                      className="rc-table__station"
                      type="button"
                      aria-pressed={s.id === selectedId}
                      onClick={() => onSelect(s.id)}
                    >
                      <i style={{ background: STATUS[a.status].color }} aria-hidden="true" />
                      <span className="num" dir="ltr">
                        {s.code}
                      </span>
                      <small>{s.district}</small>
                    </button>
                  </th>
                  <td className="num" dir="ltr">
                    {s.areaId}
                  </td>
                  <td>{s.department ?? '—'}</td>
                  <td className="num" dir="ltr">
                    {s.type} · {s.voltageKv}
                  </td>
                  <td className="num">{fmt(a.loadMva, 1)}</td>
                  <td className="num">{fmt(a.firmCapacityMva)}</td>
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
        </div>
      )}
    </section>
  )
}
