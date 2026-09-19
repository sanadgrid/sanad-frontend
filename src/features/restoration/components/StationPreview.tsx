import type { StationProblem } from '../backup/stationParse'
import type { ReviewedStation, StationState } from '../backup/stationReview'
import { fmt } from '../labels'
import type { StationRows } from '../useStationRows'

const STATE: Record<Exclude<StationState, 'bad'>, string> = {
  new: 'جديدة',
  exists: 'موجودة بالموقع نفسه — تُتجاوز',
  moved: 'الرقم موجود بموقع آخر — تُضاف موقعاً إضافياً له',
  flocUpdate: 'تحديث FLOCSAP',
  outside: 'خارج نطاق القطاع',
  swapped: 'يبدو أن خط العرض وخط الطول مقلوبان',
}
const PROBLEM: Record<StationProblem, string> = {
  noNumber: 'رقم المحطة مفقود',
  badNumber: 'رقم المحطة ليس من أربع خانات',
  noCoords: 'الإحداثيات مفقودة',
  badCoords: 'الإحداثيات ليست أرقاماً',
}
const TOTALS: [StationState, string][] = [
  ['new', 'جديدة'],
  ['moved', 'موقع إضافي'],
  ['flocUpdate', 'تحديث FLOCSAP'],
  ['exists', 'موجودة'],
  ['outside', 'خارج النطاق'],
  ['swapped', 'مقلوبة'],
  ['bad', 'غير صالحة'],
]

const coords = (r: ReviewedStation) => (r.at ? `${r.at.lat.toFixed(5)}, ${r.at.lng.toFixed(5)}` : [r.row.lat, r.row.lng].map((v) => v ?? '—').join(', '))

function RowState({ reviewed: r, onFix }: { reviewed: ReviewedStation; onFix: () => void }) {
  if (r.state === 'bad') return <span className="rc-bad">{PROBLEM[r.row.problem ?? 'badCoords']}</span>
  return (
    <ul className={`rc-bulk__notes${r.state === 'new' || r.state === 'exists' ? ' rc-stations__plain' : ''}`}>
      <li>
        {STATE[r.state]}
        {r.state === 'swapped' && (
          <button className="rc-link" type="button" onClick={onFix}>
            تبديلهما
          </button>
        )}
      </li>
      {r.flocClash && (
        <li className="rc-bad">
          FLOCSAP نفسه معطى لمحطة أخرى:{' '}
          <bdi className="num" dir="ltr">
            {r.flocClash.join(' · ')}
          </bdi>
        </li>
      )}
    </ul>
  )
}

interface StationPreviewProps {
  rows: StationRows
  /** Rows already listed at the same place are left out: nothing about them asks for a look. */
  hideExisting?: boolean
  /** The switch that takes the rows outside the sector along. */
  outsideSwitch?: boolean
}

/** Every station of the sheet with what is known about it, ticked when it would be written. */
export function StationPreview({ rows, hideExisting = false, outsideSwitch = false }: StationPreviewProps) {
  const listed = hideExisting ? rows.reviewed.filter((r) => r.state !== 'exists') : rows.reviewed
  const { counts } = rows
  return (
    <>
      <p className="rc-stations__totals">
        {TOTALS.filter(([state]) => counts[state] > 0 && !(hideExisting && state === 'exists')).map(([state, label]) => (
          <span key={state} className={state === 'bad' || state === 'swapped' ? 'rc-bad' : undefined}>
            <b className="num">{fmt(counts[state])}</b> {label}
          </span>
        ))}
        {counts.outside > 0 && outsideSwitch && (
          <label className="rc-check">
            <input type="checkbox" checked={rows.outsideToo} onChange={(e) => rows.setOutsideToo(e.target.checked)} />
            استيراد الصفوف خارج النطاق أيضاً
          </label>
        )}
      </p>
      <div className="rc-scroll rc-bulk__scroll">
        <table className="rc-table rc-table--compact rc-bulk__table rc-stations__table">
          <thead>
            <tr>
              <th scope="col">
                <span className="rc-visually-hidden">يُحفظ</span>
              </th>
              <th scope="col">السطر</th>
              <th scope="col">رقم المحطة</th>
              <th scope="col">FLOCSAP</th>
              <th scope="col">الاسم</th>
              <th scope="col">الإحداثيات</th>
              <th scope="col">الطبقة</th>
              <th scope="col">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((r) => {
              const picked = rows.isPicked(r)
              const pickable = r.state === 'new' || r.state === 'moved' || r.state === 'flocUpdate' || r.state === 'outside'
              return (
                <tr key={r.row.line} className={picked ? undefined : 'is-skipped'} data-state={r.state}>
                  <td>
                    {pickable && <input type="checkbox" aria-label={`حفظ السطر ${r.row.line}`} checked={picked} onChange={(e) => rows.pick(r.row.line, e.target.checked)} />}
                  </td>
                  <td className="num">{r.row.line}</td>
                  <th scope="row">
                    <bdi className="num" dir="ltr">
                      {r.row.no || '—'}
                    </bdi>
                  </th>
                  <td>
                    {r.row.floc && (
                      <bdi className="num rc-floc" dir="ltr">
                        {r.row.floc}
                      </bdi>
                    )}
                  </td>
                  <td>
                    <bdi>{r.row.name}</bdi>
                  </td>
                  <td>
                    <bdi className="num" dir="ltr">
                      {coords(r)}
                    </bdi>
                  </td>
                  <td>
                    <bdi>{r.row.layer}</bdi>
                  </td>
                  <td>
                    <RowState reviewed={r} onFix={() => rows.fix(r.row.line)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
