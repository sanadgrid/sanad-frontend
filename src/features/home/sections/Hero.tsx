import type { PointerEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { CountUp } from '../CountUp'
import { heroStats } from '../content'
import { trackGlow } from '../glow'
import { useLiveReadings } from '../useLiveReadings'

const towers = [
  { x: 136, y: 150, w: 47, h: 150 },
  { x: 440, y: 110, w: 60, h: 190 },
  { x: 782, y: 60, w: 76, h: 240 },
  { x: 1120, y: 110, w: 60, h: 190 },
  { x: 1376, y: 150, w: 47, h: 150 },
]

// Conductors strung between the tower cross-arms above, with a little sag.
const conductors =
  'M-40 230Q60 232 138 197M182 197Q312 225 442 169M498 169Q641 200 785 135M855 135Q988 195 1122 169M1178 169Q1278 222 1378 197M1422 197Q1450 215 1480 222'
const conductorsLow =
  'M-40 246Q60 250 142 209M178 209Q312 243 447 184M493 184Q641 222 791 154M849 154Q988 215 1127 184M1173 184Q1278 240 1382 209M1418 209Q1450 232 1480 240'

function HeroScene() {
  return (
    <svg className="hero-scene" viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <symbol id="sg-tower" viewBox="0 0 120 380">
          <g fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M60 5 20 370M60 5l40 365M28 295h64M33 245h54M39 190h42M44 138h32M48 90h24" />
            <path d="M14 108h92M4 118h112M20 108l15 38M100 108l-15 38M32 245l56 50M88 245l-56 50M39 190l48 55M81 190l-48 55M45 138l36 52M75 138l-36 52" />
          </g>
        </symbol>
        <radialGradient id="sg-sunset" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
          <stop stopColor="#f0aa5f" stopOpacity=".5" />
          <stop offset=".45" stopColor="#c9834e" stopOpacity=".16" />
          <stop offset="1" stopColor="#c9834e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sg-dune" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1d3552" />
          <stop offset="1" stopColor="#0a1b32" />
        </linearGradient>
        <linearGradient id="sg-flow">
          <stop stopColor="#1668e3" />
          <stop offset=".5" stopColor="#7df3ff" />
          <stop offset="1" stopColor="#1668e3" />
        </linearGradient>
      </defs>

      <ellipse cx="420" cy="300" rx="760" ry="250" fill="url(#sg-sunset)" />
      <circle className="hero-sun" cx="420" cy="224" r="22" />
      <path d="M0 250C240 205 420 235 700 222S1180 190 1440 232V320H0Z" fill="url(#sg-dune)" />

      <g color="#040e1c">
        {towers.map((t) => (
          <use key={t.x} href="#sg-tower" x={t.x} y={t.y} width={t.w} height={t.h} />
        ))}
      </g>
      <g fill="none" strokeLinecap="round">
        <path d={conductors} stroke="rgba(170,215,255,.28)" strokeWidth="1.2" />
        <path d={conductorsLow} stroke="rgba(170,215,255,.2)" strokeWidth="1.2" />
        <path className="hero-flow" d={conductors} stroke="url(#sg-flow)" strokeWidth="2.4" />
        <path className="hero-flow hero-flow--slow" d={conductorsLow} stroke="url(#sg-flow)" strokeWidth="2" />
      </g>

      <path d="M0 292C300 252 560 300 860 274S1260 264 1440 290V320H0Z" fill="#06152a" />
    </svg>
  )
}

// Tilts the panel toward the pointer; the CSS reads --rx / --ry.
function tilt(e: PointerEvent<HTMLDivElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 10}deg`)
  el.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 8}deg`)
}

function resetTilt(e: PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.setProperty('--rx', '0deg')
  e.currentTarget.style.setProperty('--ry', '0deg')
}

function LivePanel() {
  const { voltage, frequency, load } = useLiveReadings()

  return (
    <div className="live-stage" onPointerMove={tilt} onPointerLeave={resetTilt}>
      <span className="float-chip float-chip--a" dir="ltr" lang="en">
        <i className="dot dot--ok" /> 28 / 28 substations online
      </span>
      <span className="float-chip float-chip--b" dir="ltr" lang="en">
        <i className="dot dot--cyan" /> 0 active alarms
      </span>
    <aside className="live-panel" dir="ltr" lang="en" aria-label="Live grid readings (illustrative)">
      <header className="live-panel__head">
        <span className="live-chip">
          <i /> LIVE
        </span>
        <span className="live-panel__title">230 kV Transmission Ring</span>
      </header>

      <div className="live-panel__main">
        <div>
          <span className="live-label">Bus voltage</span>
          <strong className="live-value num">
            {voltage.toFixed(1)} <small>kV</small>
          </strong>
        </div>
        <span className="live-badge">Within range</span>
      </div>

      <svg className="live-spark" viewBox="0 0 320 84" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="sg-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#00b3c6" stopOpacity=".35" />
            <stop offset="1" stopColor="#00b3c6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 52C22 40 40 60 62 48S98 30 120 44s36 22 58 8 40-18 60-6 38 20 56 4 18-14 26-18V84H0Z"
          fill="url(#sg-spark-fill)"
        />
        <path
          className="live-spark__line"
          d="M0 52C22 40 40 60 62 48S98 30 120 44s36 22 58 8 40-18 60-6 38 20 56 4 18-14 26-18"
          pathLength="1"
        />
      </svg>

      <dl className="live-metrics">
        <div>
          <dt>Frequency</dt>
          <dd className="num">
            {frequency.toFixed(2)} <small>Hz</small>
          </dd>
        </div>
        <div>
          <dt>System load</dt>
          <dd className="num">
            {load.toLocaleString('en-US')} <small>MW</small>
          </dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd className="num">
            99.2 <small>%</small>
          </dd>
        </div>
      </dl>

      <p className="live-panel__note" dir="rtl" lang="ar">
        بيانات توضيحية لعرض الواجهة
      </p>
    </aside>
    </div>
  )
}

export function Hero() {
  return (
    <header className="hero" id="home" data-glow onPointerMove={trackGlow}>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <HeroScene />
      <div className="container hero__grid">
        <div className="hero__copy">
          <span className="eyebrow" dir="ltr">
            <i /> 230 kV AND BEYOND
          </span>
          <h1>
            شبكات أقوى.
            <br />
            <span className="accent">مراقبة أذكى.</span>
          </h1>
          <p>
            حلول هندسية ورقمية متقدمة لشبكات نقل الطاقة، تجمع قراءات الشبكة والمراقبة اللحظية وإدارة الأصول وطرح
            الأعمال في منصة واحدة.
          </p>
          <div className="actions">
            <a className="btn btn--primary" href="#monitoring">
              استكشف المنصة <Icon name="arrowLeft" size={18} />
            </a>
            <a className="btn btn--ghost" href="#tenders">
              طرح الأعمال والمناقصات
            </a>
          </div>
          <ul className="stats">
            {heroStats.map((s) => (
              <li key={s.label}>
                <strong dir="ltr">
                  <CountUp value={s.value} decimals={s.decimals} />
                  {s.suffix}
                </strong>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <LivePanel />
      </div>
    </header>
  )
}
