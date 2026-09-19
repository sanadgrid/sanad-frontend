import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import { consolePreview, ILLUSTRATIVE } from '../content'
import { NetworkMap } from '../network/NetworkMap'
import { statusOfPercent } from '../network/scene'
import './ConsolePreview.css'

const { mock } = consolePreview

function StationPanel() {
  const s = mock.station
  return (
    <aside className="cs-panel">
      <div className="cs-panel__head">
        <span className="num" dir="ltr">
          S/S {s.code}
        </span>
        <span className="cs-badge cs-badge--ok">
          <Icon name="check" size={12} />
          <bdi dir="ltr">N-1</bdi> {s.n1}
        </span>
      </div>
      <div className="cs-panel__figure">
        <strong className="num" dir="ltr">
          {s.percent}%
        </strong>
        <span>
          <i className={`dot dot--${statusOfPercent(s.percent)}`} />
          {s.caption}
        </span>
      </div>
      <dl className="cs-panel__facts">
        {s.facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd className="num" dir="ltr">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="cs-stages">
        <span className="cs-panel__label">{s.stagesTitle}</span>
        <div className="cs-stages__bar">
          {s.stages.map((stage) => (
            <i className={`cs-stage--${stage.key}`} key={stage.key} style={{ flexGrow: stage.share }} />
          ))}
        </div>
        <ul>
          {s.stages.map((stage) => (
            <li key={stage.key}>
              <i className={`cs-stage--${stage.key}`} />
              {stage.label}
              <b className="num" dir="ltr">
                {stage.share}%
              </b>
            </li>
          ))}
        </ul>
      </div>
      <div className="cs-panel__risk">
        <span>
          {s.risk.label}{' '}
          <b className="num" dir="ltr">
            {s.risk.customers}
          </b>
        </span>
        <em>
          <i className="dot dot--sensitive" />
          {s.risk.sensitive}
        </em>
      </div>
      <span className="cs-panel__label">{s.transfersTitle}</span>
      <ul className="cs-transfers">
        {s.transfers.map((t) => (
          <li key={t.to}>
            <span className="num" dir="ltr">
              S/S {t.to}
            </span>
            <b className="num" dir="ltr">
              {t.mva} MVA
            </b>
            <em>{t.switching}</em>
            <small>{t.limit}</small>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function PriorityTable() {
  const t = mock.table
  return (
    <div className="cs-table">
      <div className="cs-table__head">
        <span>{t.title}</span>
        <span className="cs-ghost">
          <Icon name="download" size={13} />
          <bdi dir="ltr">CSV</bdi>
        </span>
      </div>
      <div className="cs-table__grid">
        {t.columns.map((c) => (
          <span className="cs-th" key={c}>
            {c}
          </span>
        ))}
        {t.rows.map((r) => (
          <div className="cs-tr" key={r.code}>
            <span className="num" dir="ltr">
              S/S {r.code}
            </span>
            <span className={`cs-meter tone--${r.status}`} style={{ '--ratio': r.percent / 100 } as CSSProperties}>
              <i />
              <b className="num" dir="ltr">
                {r.percent}%
              </b>
            </span>
            <span className="num" dir="ltr">
              {r.remote}
            </span>
            <span className="num" dir="ltr">
              {r.customers}
            </span>
            <span className="num" dir="ltr">
              {r.sensitive}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ConsolePreview() {
  return (
    <section className="section section--navy" id="console">
      <div className="container">
        <div className="console-head reveal">
          <div>
            <span className="kicker" dir="ltr" lang="en">
              {consolePreview.kicker}
            </span>
            <h2>{consolePreview.title}</h2>
            <p className="sub">{consolePreview.sub}</p>
          </div>
          <ul className="console-points">
            {consolePreview.points.map((p) => (
              <li key={p.text}>
                <Icon name={p.icon} size={18} />
                {p.text}
              </li>
            ))}
          </ul>
        </div>

        <figure className="console reveal" aria-label={`${consolePreview.sub} ${ILLUSTRATIVE}.`}>
          <div className="console__window" aria-hidden="true">
            <div className="cs-top">
              <Logo size={26} withWordmark={false} tone="onLight" />
              <strong>{mock.title}</strong>
              <div className="cs-top__filters">
                {mock.filters.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>
              <span className="chip chip--quiet">{ILLUSTRATIVE}</span>
            </div>
            <div className="cs-kpis">
              {mock.kpis.map((k) => (
                <div key={k.label}>
                  <span>{k.label}</span>
                  <strong className="num" dir="ltr">
                    {k.value}
                  </strong>
                  <em>{k.unit}</em>
                </div>
              ))}
            </div>
            <div className="cs-body">
              <StationPanel />
              <div className="cs-map">
                <NetworkMap mode="overview" selected={mock.station.code} label="" />
              </div>
            </div>
            <PriorityTable />
          </div>
        </figure>
      </div>
    </section>
  )
}
