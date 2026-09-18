import { Icon } from '../../../components/Icon'
import { networkPoints } from '../content'

type NodeKind = 'plant' | 'station' | 'load'

const nodes: { id: string; x: number; y: number; kind: NodeKind; alert?: boolean }[] = [
  { id: 'G-01', x: 70, y: 100, kind: 'plant' },
  { id: 'G-02', x: 70, y: 320, kind: 'plant' },
  { id: 'SS-01', x: 230, y: 210, kind: 'station' },
  { id: 'SS-02', x: 400, y: 100, kind: 'station' },
  { id: 'SS-03', x: 400, y: 320, kind: 'station', alert: true },
  { id: 'SS-04', x: 560, y: 210, kind: 'station' },
  { id: 'L-01', x: 670, y: 100, kind: 'load' },
  { id: 'L-02', x: 670, y: 320, kind: 'load' },
]

// Single-line-diagram style: every circuit runs on right angles, like the logo's grid.
const circuits = [
  'M70 100H150V210H230',
  'M70 320H150V210H230',
  'M230 210H315V100H400',
  'M230 210H315V320H400',
  'M400 100V320',
  'M400 100H485V210H560',
  'M400 320H485V210H560',
  'M560 210H615V100H670',
  'M560 210H615V320H670',
]

const glyph: Record<NodeKind, string> = { plant: 'G', station: '', load: 'L' }

export function Network() {
  return (
    <section className="section network" id="network">
      <div className="container network__grid">
        <div className="network__copy reveal">
          <span className="kicker">NETWORK TOPOLOGY</span>
          <h2>
            كل محطة وخط.
            <br />
            <span className="accent">في صورة واحدة.</span>
          </h2>
          <p className="sub sub--dark">
            خريطة حية للشبكة تبيّن تدفق القدرة وحالة كل محطة، وتحدد موقع الحدث لحظة وقوعه.
          </p>
          <ul className="network__points">
            {networkPoints.map((p) => (
              <li key={p.title}>
                <span className="network__icon">
                  <Icon name={p.icon} size={20} />
                </span>
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <figure className="network__map reveal" dir="ltr" lang="en">
          <figcaption>
            <span className="live-chip">
              <i /> LIVE
            </span>
            230 kV single-line overview
            <em>
              <i className="dot dot--cyan" /> Normal <i className="dot dot--warn" /> Warning
            </em>
          </figcaption>
          <svg viewBox="0 0 740 420" role="img" aria-label="Animated diagram of a transmission network">
            <g className="network__wires">
              {circuits.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g className="network__flow">
              {circuits.map((d, i) => (
                <path key={d} d={d} style={{ animationDuration: `${1.6 + (i % 3) * 0.5}s` }} />
              ))}
            </g>
            {nodes.map((n) => (
              <g
                key={n.id}
                className={`network__node${n.alert ? ' is-alert' : ''}`}
                transform={`translate(${n.x} ${n.y})`}
              >
                <circle className="network__pulse" r="21" />
                {n.kind === 'station' ? <rect x="-18" y="-18" width="36" height="36" rx="9" /> : <circle r="18" />}
                <text className="network__glyph" y="5">
                  {glyph[n.kind]}
                </text>
                <text className="network__label" y="44">
                  {n.id}
                </text>
              </g>
            ))}
          </svg>
        </figure>
      </div>
    </section>
  )
}
