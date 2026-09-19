import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { ratioLabel } from '../backup/format'
import type { Coverage, PlanKpis } from '../backup/planNetwork'
import { fmt, STATUS, STATUS_ORDER } from '../labels'

interface KpiCardsProps {
  kpis: PlanKpis
  /** Cases in the sector, before filtering. */
  total: number
  coverage: Coverage
  sectorName: string
  /** The assumptions every figure rests on, as small chips beside the title. */
  assumptions: ReactNode
  loading: boolean
  open: boolean
  onToggle: () => void
}

interface KpiProps {
  label: ReactNode
  value: string
  unit?: string
  /** A second, smaller line: the same figure in another unit. */
  sub?: string
  tone?: 'ok' | 'warn' | 'bad'
  /** The longer explanation, shown on hover so the tile stays small. */
  hint: string
}

function Kpi({ label, value, unit, sub, tone, hint }: KpiProps) {
  return (
    <div className={`rc-kpi${tone ? ` rc-kpi--${tone}` : ''}`} title={hint}>
      <span className="rc-kpi__label">{label}</span>
      <strong className="num" dir="ltr">
        {value}
        {unit && <small> {unit}</small>}
      </strong>
      {sub && (
        <span className="rc-kpi__sub num" dir="ltr">
          {sub}
        </span>
      )}
    </div>
  )
}

// conic-gradient stops built from the status counts
function donutGradient(kpis: PlanKpis): string {
  if (kpis.cases === 0) return 'var(--rc-track)'
  let from = 0
  const stops = STATUS_ORDER.map((status) => {
    const to = from + (kpis.byStatus[status] / kpis.cases) * 100
    const stop = `${STATUS[status].color} ${from}% ${to}%`
    from = to
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
}

const TONE = { full: 'ok', high: 'warn', limited: 'bad', none: 'bad' } as const

/** How much of the imported network has a plan yet — said wherever the figures are, so nobody takes them for the whole sector. */
export function CoverageLine({ coverage }: { coverage: Coverage }) {
  if (coverage.imported === 0) return <>لا توجد محطات مستوردة بعد</>
  return (
    <>
      <b className="num">{fmt(coverage.planned)}</b> من <b className="num">{fmt(coverage.imported)}</b> محطة لها خطة
    </>
  )
}

export function KpiCards({ kpis, total, coverage, sectorName, assumptions, loading, open, onToggle }: KpiCardsProps) {
  const lead = (
    <div className="rc-kpis__lead">
      <h1 className="rc-title">قدرة استعادة الخدمة</h1>
      <p>{sectorName}</p>
      {assumptions}
    </div>
  )

  if (loading || total === 0)
    return (
      <section className="rc-float rc-kpis rc-kpis--empty" aria-label="مؤشرات خطط التغذية البديلة">
        {lead}
        <p className="rc-kpis__none" role={loading ? 'status' : undefined}>
          {loading ? (
            <b>جارٍ تحميل خطط التغذية البديلة…</b>
          ) : (
            <>
              <b>لا توجد خطط تغذية بديلة بعد</b>
              <span>
                <CoverageLine coverage={coverage} />
              </span>
            </>
          )}
        </p>
      </section>
    )

  const tone = kpis.cases ? TONE[kpis.status] : undefined

  // folded away: the two figures an operator glances at, and the way back
  if (!open)
    return (
      <button className="rc-float rc-kpis-pill" type="button" aria-expanded={false} aria-label="إظهار المؤشرات" onClick={onToggle}>
        <span className={`rc-kpis-pill__figure${tone ? ` rc-kpi--${tone}` : ''}`}>
          <i aria-hidden="true" />
          نسبة الاستعادة
          <b className="num" dir="ltr">
            {ratioLabel(kpis.ratio, 1)}
          </b>
        </span>
        <span className={`rc-kpis-pill__figure rc-kpi--${kpis.below100 ? 'bad' : 'ok'}`}>
          <i aria-hidden="true" />
          <b className="num">{fmt(kpis.below100)}</b>
          أقل من <span dir="ltr">100%</span>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>
    )

  return (
    <section className="rc-float rc-kpis" aria-label="مؤشرات الخطط الظاهرة">
      {lead}

      <div className="rc-kpis__tiles">
        <Kpi
          label="نسبة الاستعادة"
          value={ratioLabel(kpis.ratio, 1).replace('%', '')}
          unit="%"
          tone={tone}
          hint="مجموع ما يمكن استعادته ÷ مجموع أحمال العناصر الرئيسية — كل خطة موزونة بحملها"
        />
        <Kpi label="مجموع الأحمال" value={fmt(kpis.loadA)} unit="A" sub={`${fmt(kpis.loadMva, 1)} MVA`} hint="مجموع أحمال العناصر الرئيسية في الخطط الظاهرة" />
        <Kpi
          label="غير القابل للاستعادة"
          value={fmt(kpis.unrestorableA)}
          unit="A"
          sub={`${fmt(kpis.unrestorableMva, 1)} MVA · ${fmt(kpis.unrestorableMw, 1)} MW`}
          tone={kpis.unrestorableA > 0 ? 'bad' : 'ok'}
          hint="مجموع ما يبقى بلا تغذية عند فقد كل عنصر رئيسي على حدة (MW بمعامل قدرة 0.9)"
        />
        <Kpi
          label={
            <>
              خطط أقل من <span dir="ltr">100%</span>
            </>
          }
          value={fmt(kpis.below100)}
          tone={kpis.below100 ? 'bad' : 'ok'}
          hint="خطط لا تكفي بدائلها لاستعادة كامل الحمل"
        />
        <Kpi
          label="بدائل تتجاوز سعتها"
          value={fmt(kpis.overRated)}
          tone={kpis.overRated ? 'warn' : 'ok'}
          hint="بدائل حملها الحالي أعلى من سعة القاطع المعتمدة — لا تستقبل أي حمل"
        />
        <Kpi
          label="التغطية"
          value={fmt(coverage.planned)}
          unit={`/ ${fmt(coverage.imported)}`}
          sub="محطة لها خطة"
          hint="عدد المحطات المستوردة التي لها خطة تغذية بديلة، من إجمالي المحطات المستوردة — الأرقام أعلاه تخص هذه المحطات فقط"
        />

        <div className="rc-kpi rc-kpi--donut">
          <div className="rc-donut" style={{ background: donutGradient(kpis) }} role="img" aria-label="توزيع الخطط حسب التصنيف">
            <div>
              <strong className="num">{fmt(kpis.cases)}</strong>
            </div>
          </div>
          <div className="rc-donut__side">
            <span className="rc-kpi__label">
              <span className="num">{fmt(kpis.cases)}</span> من <span className="num">{fmt(total)}</span> خطة
            </span>
            <ul className="rc-donut__legend">
              {STATUS_ORDER.map((status) => (
                <li key={status} title={STATUS[status].label}>
                  <i style={{ background: STATUS[status].color }} aria-hidden="true" />
                  <b className="num">{fmt(kpis.byStatus[status])}</b>
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
