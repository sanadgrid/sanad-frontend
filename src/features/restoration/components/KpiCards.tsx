import type { ReactNode } from 'react'
import { fmt, STATUS, STATUS_ORDER } from '../labels'
import type { Summary } from '../summary'

interface KpiCardsProps {
  summary: Summary
  /** Stations in the sector, before filtering. */
  total: number
}

interface KpiProps {
  label: ReactNode
  value: string
  unit?: string
  tone?: 'ok' | 'warn' | 'bad'
  note?: ReactNode
}

function Kpi({ label, value, unit, tone, note }: KpiProps) {
  return (
    <div className={`rc-kpi${tone ? ` rc-kpi--${tone}` : ''}`}>
      <span className="rc-kpi__label">{label}</span>
      <strong className="num" dir="ltr">
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      {note && <span className="rc-kpi__note">{note}</span>}
    </div>
  )
}

// conic-gradient stops built from the status counts
function donutGradient(summary: Summary): string {
  if (summary.stations === 0) return 'rgba(255, 255, 255, 0.08)'
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

export function KpiCards({ summary, total }: KpiCardsProps) {
  return (
    <section className="rc-kpis" aria-label="مؤشرات المحطات الظاهرة">
      <Kpi
        label="متوسط قدرة الاستعادة (موزون بالحمل)"
        value={fmt(summary.capacityPct, 1)}
        unit="%"
        tone={summary.stations ? toneFor(summary.capacityPct) : undefined}
        note={
          <>
            <span className="num">{fmt(summary.stations)}</span> من <span className="num">{fmt(total)}</span> محطة ·{' '}
            <span className="num" dir="ltr">
              {fmt(summary.loadMva)} MVA
            </span>
          </>
        }
      />
      <Kpi label="إجمالي الحمل غير المستعاد" value={fmt(summary.unrestoredMw)} unit="MW" note="مجموع حالات فقد كل محطة على حدة" />
      <Kpi label="مشتركون معرضون للانقطاع" value={fmt(summary.customersAtRisk)} />
      <Kpi
        label={<>محطات لا تحقق {n1}</>}
        value={fmt(summary.failingN1)}
        tone={summary.failingN1 ? 'bad' : 'ok'}
        note="لا يمكن استعادة كامل حملها من الشبكة"
      />
      <Kpi
        label={<>محطات لا تحقق {n1} للمحولات</>}
        value={fmt(summary.failingTransformerN1)}
        tone={summary.failingTransformerN1 ? 'warn' : 'ok'}
        note="الحمل أعلى من السعة المؤكدة"
      />

      <div className="rc-kpi rc-kpi--donut">
        <div className="rc-donut" style={{ background: donutGradient(summary) }} role="img" aria-label="توزيع حالات الاستعادة">
          <div>
            <strong className="num">{fmt(summary.stations)}</strong>
            <span>محطة</span>
          </div>
        </div>
        <ul className="rc-donut__legend">
          {STATUS_ORDER.map((status) => (
            <li key={status}>
              <i style={{ background: STATUS[status].color }} aria-hidden="true" />
              {STATUS[status].label}
              <b className="num">{fmt(summary.byStatus[status])}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
