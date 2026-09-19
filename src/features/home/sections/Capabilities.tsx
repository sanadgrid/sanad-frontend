import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { ampsToMva } from '../../restoration/backup/units'
import { assessCase } from '../../restoration/backup/model'
import { capabilities, ILLUSTRATIVE } from '../content'
import { trackGlow } from '../glow'
import { feeders } from '../proof/dataset'
import { SectionHead } from './SectionHead'

// min(tie, feeder headroom, firm capacity): the rule every transfer obeys.
function LimitsVisual() {
  return (
    <div className="cap-visual cap-visual--limits" aria-hidden="true">
      <span className="cap-visual__fn num" dir="ltr">
        min
      </span>
      <ul>
        {capabilities.limits.map((limit, i) => (
          <li key={limit} style={{ '--fill': `${[62, 88, 74][i]}%` } as CSSProperties}>
            <span>{limit}</span>
            <i />
            {i === 0 && <em className="chip chip--quiet">{capabilities.binding}</em>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Three rows of the worked example, assessed by the model exactly as the
// planners' sheet would: load, the two backups, and what comes back.
const SHEET_ROWS = [0, 6, 15].map((i) => ({ feeder: feeders[i], result: assessCase(feeders[i]) }))

function SheetVisual() {
  return (
    <div className="cap-visual cap-sheet" aria-hidden="true">
      <table className="num" dir="ltr">
        <thead>
          <tr>
            <th />
            <th>Load A</th>
            <th>B1</th>
            <th>B2</th>
            <th>Restored</th>
            <th>MVA</th>
          </tr>
        </thead>
        <tbody>
          {SHEET_ROWS.map(({ feeder, result }) => (
            <tr key={feeder.id}>
              <th>{feeder.id}</th>
              <td>{feeder.main.loadA}</td>
              <td>{feeder.backups[0].loadA}</td>
              <td>{feeder.backups[1].loadA}</td>
              <td>
                <i className={`dot dot--${result.status}`} />
                {Math.round(result.ratio * 100)}%
              </td>
              <td>{ampsToMva(result.restorableA, feeder.voltageKv).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="chip chip--quiet">{ILLUSTRATIVE}</span>
    </div>
  )
}

export function Capabilities() {
  return (
    <section className="section" id="capabilities">
      <div className="container">
        <SectionHead kicker={capabilities.kicker} title={capabilities.title} sub={capabilities.sub} />
        <div className="caps" onPointerMove={trackGlow}>
          {capabilities.lead.map((cap, i) => (
            <article className="cap cap--lead reveal" data-glow key={cap.title} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="cap__icon">
                <Icon name={cap.icon} size={22} />
              </span>
              <h3>{cap.title}</h3>
              <p>{cap.text}</p>
              {cap.visual === 'limits' ? <LimitsVisual /> : <SheetVisual />}
            </article>
          ))}
          {capabilities.rest.map((cap, i) => (
            <article className="cap reveal" data-glow key={cap.title} style={{ animationDelay: `${(i + 2) * 70}ms` }}>
              <span className="cap__icon">
                <Icon name={cap.icon} size={20} />
              </span>
              <h3>{cap.title}</h3>
              <p>{cap.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
