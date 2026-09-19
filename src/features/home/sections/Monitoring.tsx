import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import { CountUp } from '../CountUp'
import { assetStatus, dashboardNav, kpis } from '../content'

// conic-gradient stops built from the asset status shares
const donutGradient = (() => {
  let from = 0
  const stops = assetStatus.map((s) => {
    const stop = `${s.color} ${from}% ${from + s.share}%`
    from += s.share
    return stop
  })
  return `conic-gradient(${stops.join(', ')})`
})()

const voltagePath = 'M0 93C45 68 80 104 120 82S190 68 230 83s70 23 120-9 80-20 122 1 73 36 123 1 60-14 105-27'
const loadPath = 'M0 112c48-19 86 8 135-11s85-17 138-2 77 23 134-8 88-18 135 3 78 25 158-16'

export function Monitoring() {
  return (
    <section className="section section--light section--flush-top" id="monitoring">
      <div className="container">
        <div className="section-head reveal">
          <div>
            <span className="kicker">LIVE OPERATIONS</span>
            <h2>لوحة تحكم تتحرك مع الشبكة.</h2>
          </div>
          <p className="sub">
            مؤشرات الشبكة وحالة الأصول والتنبيهات في شاشة واحدة، مرتبة حسب الأولوية ليصل المشغّل إلى القرار بدون
            ازدحام.
          </p>
        </div>

        <div className="dashboard reveal" dir="ltr" lang="en">
          <aside className="dashboard__side">
            <Logo size={30} />
            <nav aria-label="Dashboard preview navigation">
              {dashboardNav.map((item, i) => (
                <span className={i === 0 ? 'active' : undefined} key={item.label}>
                  <Icon name={item.icon} size={16} /> {item.label}
                </span>
              ))}
            </nav>
          </aside>

          <div className="dashboard__main">
            <div className="dashboard__top">
              <div>
                <h3>230 kV Network Overview</h3>
                <small>Real-time transmission insights</small>
              </div>
              <span className="status-pill">
                <i /> All systems online
              </span>
            </div>

            <div className="kpis">
              {kpis.map((k) => (
                <div className="card" key={k.label}>
                  <span className="card__label">{k.label}</span>
                  <strong>
                    <CountUp value={k.value} decimals={k.decimals} duration={1300} />
                    {k.unit && <small> {k.unit}</small>}
                  </strong>
                  <span className="card__note">{k.note}</span>
                </div>
              ))}
            </div>

            <div className="dashboard__row">
              <div className="card chart">
                <div className="card__head">
                  <b>Live Grid Readings</b>
                  <span className="legend">
                    <i style={{ background: '#1668e3' }} /> Voltage
                    <i style={{ background: '#00b3c6' }} /> Load
                    <em>Last 24 hours</em>
                  </span>
                </div>
                <svg viewBox="0 0 700 145" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="sg-chart-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop stopColor="#1668e3" stopOpacity=".18" />
                      <stop offset="1" stopColor="#1668e3" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="chart__area" d={`${voltagePath}V145H0Z`} fill="url(#sg-chart-fill)" />
                  <path className="chart__line" d={voltagePath} pathLength="1" />
                  <path className="chart__line chart__line--load" d={loadPath} pathLength="1" />
                </svg>
                <div className="chart__axis num">
                  <span>00:00</span>
                  <span>06:00</span>
                  <span>12:00</span>
                  <span>18:00</span>
                  <span>24:00</span>
                </div>
              </div>

              <div className="card">
                <div className="card__head">
                  <b>Asset Status</b>
                </div>
                <div className="donut" style={{ background: donutGradient }}>
                  <div>
                    <strong className="num">1,286</strong>
                    <span>Assets</span>
                  </div>
                </div>
                <ul className="donut-legend">
                  {assetStatus.map((s) => (
                    <li key={s.label}>
                      <i style={{ background: s.color }} /> {s.label} <b className="num">{s.share}%</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
