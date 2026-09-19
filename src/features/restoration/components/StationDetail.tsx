import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { FeederRow } from '../backup/fromNetwork'
import { STAGE_MINUTES } from '../engine'
import type { StationRow } from '../filters'
import { fmt, LIMIT_LABEL, STATUS, SWITCHING_LABEL } from '../labels'
import { FeederList } from './FeederCard'

interface StationDetailProps {
  row: StationRow | null
  /** Arabic name of the station's operating area. */
  areaName: string
  feeders: FeederRow[]
  /** The card of the feeder being looked at; it takes the place of the station's own figures. */
  feederCard: ReactNode
  onFeeder: (feederId: string) => void
  onClose: () => void
}

const mva = (value: number) => (
  <span className="num" dir="ltr">
    {fmt(value, 1)} MVA
  </span>
)

const minutes = (value: number) => (
  <span className="num" dir="ltr">
    ~{value} min
  </span>
)

export function StationDetail({ row, areaName, feeders, feederCard, onFeeder, onClose }: StationDetailProps) {
  // nothing selected, nothing shown: the map keeps the room
  if (!row) return null

  const { station, assessment: a } = row
  const share = (value: number) => `${a.loadMva > 0 ? (value / a.loadMva) * 100 : 0}%`
  const stages = [
    { key: 'remote', label: 'مناورة بالتحكم عن بُعد', mva: a.restoredRemoteMva, minutes: STAGE_MINUTES.remote },
    { key: 'manual', label: 'مناورة يدوية ميدانية', mva: a.restoredManualMva, minutes: STAGE_MINUTES.manual },
    { key: 'temporary', label: 'مصدر تغذية مؤقت', mva: a.temporaryMva, minutes: STAGE_MINUTES.temporary },
  ]
  // what stays dark even after the mobile generation is connected
  const darkMva = Math.max(0, a.unrestoredMva - a.temporaryMva)

  return (
    <aside className="rc-float rc-drawer rc-detail" id="rc-detail" aria-label="تفاصيل المحطة">
      <header className="rc-drawer__head rc-detail__head">
        <div>
          <h2 className="rc-detail__code num" dir="ltr">
            {station.code}
          </h2>
          <p>
            {station.district} · {areaName}
            {station.department && ` · ${station.department}`}
          </p>
        </div>
        <button className="rc-icon-btn" type="button" aria-label="إغلاق التفاصيل" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>

      {feederCard && <div className="rc-drawer__body">{feederCard}</div>}

      <div className="rc-drawer__body" hidden={Boolean(feederCard)}>
        <div className="rc-detail__chips">
          <span className={`rc-chip rc-status--${a.status}`}>
            <i aria-hidden="true" /> {STATUS[a.status].label}
          </span>
          <span className="rc-chip rc-chip--plain num" dir="ltr">
            {station.type} · {station.voltageKv} kV
          </span>
        </div>

        <div className="rc-detail__score">
          <strong className={`num rc-status--${a.status}`} dir="ltr">
            {a.capacityPct}%
          </strong>
          <span>من حمل المحطة يمكن للشبكة استعادته عند فقدها</span>
        </div>

        <dl className="rc-facts">
          <div>
            <dt>الحمل</dt>
            <dd>{mva(a.loadMva)}</dd>
          </div>
          <div>
            <dt>السعة المؤكدة</dt>
            <dd>{mva(a.firmCapacityMva)}</dd>
          </div>
          <div>
            <dt>
              <span dir="ltr">N-1</span> للمحولات
            </dt>
            <dd className={a.transformerN1 ? 'rc-ok' : 'rc-bad'}>{a.transformerN1 ? 'محقق' : 'غير محقق'}</dd>
          </div>
          <div>
            <dt>
              <span dir="ltr">N-1</span> للمحطة
            </dt>
            <dd className={a.n1 ? 'rc-ok' : 'rc-bad'}>{a.n1 ? 'محقق' : 'غير محقق'}</dd>
          </div>
        </dl>

        <h3 className="rc-detail__title">مراحل الاستعادة</h3>
        <div className="rc-stack" aria-hidden="true">
          {stages.map((s) => (
            <i key={s.key} className={`rc-stack__${s.key}`} style={{ width: share(s.mva) }} />
          ))}
          <i className="rc-stack__dark" style={{ width: share(darkMva) }} />
        </div>
        <ul className="rc-stages">
          {stages.map((s) => (
            <li key={s.key}>
              <i className={`rc-stack__${s.key}`} aria-hidden="true" />
              <span>{s.label}</span>
              {minutes(s.minutes)}
              <b>{mva(s.mva)}</b>
            </li>
          ))}
          <li>
            <i className="rc-stack__dark" aria-hidden="true" />
            <span>حمل غير مستعاد من الشبكة</span>
            <span className="num" dir="ltr">
              {fmt(a.unrestoredMw, 1)} MW
            </span>
            <b>{mva(a.unrestoredMva)}</b>
          </li>
        </ul>

        <dl className="rc-facts">
          <div>
            <dt>المشتركون</dt>
            <dd className="num">{fmt(a.customers)}</dd>
          </div>
          <div>
            <dt>مشتركون معرضون للانقطاع</dt>
            <dd className={`num ${a.customersAtRisk > 0 ? 'rc-bad' : 'rc-ok'}`}>{fmt(a.customersAtRisk)}</dd>
          </div>
        </dl>

        {(station.sensitiveCustomers.length > 0 || station.vipCustomers.length > 0) && (
          <ul className="rc-tags">
            {station.sensitiveCustomers.map((c) => (
              <li className="rc-tag rc-tag--sensitive" key={`s-${c}`}>
                {c}
              </li>
            ))}
            {station.vipCustomers.map((c) => (
              <li className="rc-tag rc-tag--vip" key={`v-${c}`}>
                {c}
              </li>
            ))}
          </ul>
        )}

        <FeederList feeders={feeders} onSelect={onFeeder} />

        <h3 className="rc-detail__title">
          المناقلات عبر نقاط الربط <small className="num">({a.transfers.length})</small>
        </h3>
        {a.transfers.length === 0 ? (
          <p className="rc-detail__none">لا توجد نقاط ربط بجهد المحطة مع محطات مجاورة، أو لا سعة متاحة لدى الجوار.</p>
        ) : (
          <div className="rc-scroll">
            <table className="rc-table rc-table--compact">
              <thead>
                <tr>
                  <th scope="col">من مغذي ← إلى</th>
                  <th scope="col">
                    <span dir="ltr">MVA</span>
                  </th>
                  <th scope="col">المناورة</th>
                  <th scope="col">العامل المحدِّد</th>
                </tr>
              </thead>
              <tbody>
                {a.transfers.map((t) => (
                  <tr key={t.tieId}>
                    <td className="num" dir="ltr">
                      {t.fromFeederCode} → {t.toStationCode} / {t.toFeederCode}
                    </td>
                    <td className="num">{fmt(t.mva, 1)}</td>
                    <td>{SWITCHING_LABEL[t.switching]}</td>
                    <td>{LIMIT_LABEL[t.limitedBy]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  )
}
