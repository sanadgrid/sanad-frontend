import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { fmt, STATUS, STATUS_ORDER } from '../labels'
import type { Summary } from '../summary'

interface KpiCardsProps {
  summary: Summary
  /** Stations in the sector, before filtering. */
  total: number
  /** What the figures are about: the sector, and the period and scenario they are computed for. */
  sectorName: string
  conditionsLabel: string
  open: boolean
  onToggle: () => void
}

interface KpiProps {
  label: ReactNode
  value: string
  unit?: string
  tone?: 'ok' | 'warn' | 'bad'
  /** The longer explanation, shown on hover so the tile stays small. */
  hint: string
}

function Kpi({ label, value, unit, tone, hint }: KpiProps) {
  return (
    <div className={`rc-kpi${tone ? ` rc-kpi--${tone}` : ''}`} title={hint}>
      <span className="rc-kpi__label">{label}</span>
      <strong className="num" dir="ltr">
        {value}
        {unit && <small> {unit}</small>}
      </strong>
    </div>
  )
}

// conic-gradient stops built from the status counts
function donutGradient(summary: Summary): string {
  if (summary.stations === 0) return 'var(--rc-track)'
  let from = 0
  const stops = STATUS_ORDER.map((status) => {
    const to = from + (summary.byStatus[status] / summary.stations) * 100
    const stop = `${STATUS[status].color} ${from}% ${to}%`
    from = to
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
}

const toneFor = (pct: number) => (pct >= 99.5 ? 'ok' : pct >= 70 ? 'warn' : 'bad')
const n1 = <span dir="ltr">N-1</span>

export function KpiCards({ summary, total, sectorName, conditionsLabel, open, onToggle }: KpiCardsProps) {
  const capacityTone = summary.stations ? toneFor(summary.capacityPct) : undefined

  // folded away: the two figures an operator glances at, and the way back
  if (!open)
    return (
      <button
        className="rc-float rc-kpis-pill"
        type="button"
        aria-expanded={false}
        aria-label="إظهار المؤشرات"
        onClick={onToggle}
      >
        <span className={`rc-kpis-pill__figure${capacityTone ? ` rc-kpi--${capacityTone}` : ''}`}>
          <i aria-hidden="true" />
          قدرة الاستعادة
          <b className="num" dir="ltr">
            {fmt(summary.capacityPct, 1)}%
          </b>
        </span>
        <span className={`rc-kpis-pill__figure rc-kpi--${summary.failingN1 ? 'bad' : 'ok'}`}>
          <i aria-hidden="true" />
          <b className="num">{fmt(summary.failingN1)}</b>
          لا تحقق {n1}
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
    )

  return (
    <section className="rc-float rc-kpis" aria-label="مؤشرات المحطات الظاهرة">
      <div className="rc-kpis__lead">
        <h1 className="rc-title">قدرة استعادة الخدمة</h1>
        <p>
          {sectorName} · {conditionsLabel}
        </p>
      </div>

      <div className="rc-kpis__tiles">
        <Kpi
          label="متوسط قدرة الاستعادة"
          value={fmt(summary.capacityPct, 1)}
          unit="%"
          tone={capacityTone}
          hint="متوسط قدرة الاستعادة موزوناً بحمل كل محطة — ماذا يحدث لو فُقدت المحطة بالكامل؟"
        />
        <Kpi
          label="الحمل غير المستعاد"
          value={fmt(summary.unrestoredMw)}
          unit="MW"
          hint="إجمالي الحمل غير المستعاد: مجموع حالات فقد كل محطة على حدة"
        />
        <Kpi
          label="مشتركون معرضون للانقطاع"
          value={fmt(summary.customersAtRisk)}
          hint="المشتركون الذين يبقون بلا تغذية بعد استنفاد كل المناقلات"
        />
        <Kpi
          label={<>محطات لا تحقق {n1}</>}
          value={fmt(summary.failingN1)}
          tone={summary.failingN1 ? 'bad' : 'ok'}
          hint="محطات لا يمكن استعادة كامل حملها من الشبكة"
        />
        <Kpi
          label={<>لا تحقق {n1} للمحولات</>}
          value={fmt(summary.failingTransformerN1)}
          tone={summary.failingTransformerN1 ? 'warn' : 'ok'}
          hint="محطات حملها أعلى من السعة المؤكدة لمحولاتها"
        />

        <div className="rc-kpi rc-kpi--donut">
          <div className="rc-donut" style={{ background: donutGradient(summary) }} role="img" aria-label="توزيع حالات الاستعادة">
            <div>
              <strong className="num">{fmt(summary.stations)}</strong>
            </div>
          </div>
          <div className="rc-donut__side">
            <span className="rc-kpi__label">
              <span className="num">{fmt(summary.stations)}</span> من <span className="num">{fmt(total)}</span> محطة ·{' '}
              <span className="num" dir="ltr">
                {fmt(summary.loadMva)} MVA
              </span>
            </span>
            <ul className="rc-donut__legend">
              {STATUS_ORDER.map((status) => (
                <li key={status} title={STATUS[status].label}>
                  <i style={{ background: STATUS[status].color }} aria-hidden="true" />
                  <b className="num">{fmt(summary.byStatus[status])}</b>
                  <span className="rc-sr">{STATUS[status].label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <button className="rc-icon-btn" type="button" aria-expanded aria-label="طيّ المؤشرات" title="طيّ المؤشرات" onClick={onToggle}>
        <Icon name="chevronUp" size={17} />
      </button>
    </section>
  )
}
