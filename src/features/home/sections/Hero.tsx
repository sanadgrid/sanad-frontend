import { Icon } from '../../../components/Icon'
import { cta, hero, ILLUSTRATIVE, questions, statusLabel } from '../content'
import { trackGlow } from '../glow'
import { NetworkMap } from '../network/NetworkMap'
import { loss, LOST } from '../network/scene'

const fmt = (value: number) => Math.round(value).toLocaleString('en-US')

// The event the map is showing, read out the way the console reports it.
function EventCard() {
  return (
    <figure className="event">
      <header className="event__bar">
        <span className="event__title">
          <i aria-hidden="true" />
          فقدان المحطة
          <bdi className="num" dir="ltr">
            S/S {LOST.code}
          </bdi>
        </span>
        <span className="chip chip--quiet">{ILLUSTRATIVE}</span>
      </header>

      <NetworkMap
        mode="loss"
        label={`خريطة توضيحية لشبكة توزيع: فُقدت المحطة ${LOST.code} ويُنقل حملها إلى محطتين بديلتين عبر خطي ربط`}
      />

      <figcaption className="event__readout">
        <div className="event__figure">
          <strong className="num" dir="ltr">
            {(loss.ratio * 100).toFixed(1)}%
          </strong>
          <span>
            <i className={`dot dot--${loss.status}`} aria-hidden="true" />
            يُستعاد من الحمل
          </span>
        </div>
        <dl className="event__facts">
          <div>
            <dt>الحمل المفقود</dt>
            <dd className="num" dir="ltr">
              {fmt(loss.loadA)} A
            </dd>
          </div>
          <div>
            <dt>غير مستعاد</dt>
            <dd className="num event__short" dir="ltr">
              {fmt(loss.unrestorableA)} A
            </dd>
          </div>
        </dl>
        <ol className="event__transfers">
          {loss.transfers.map((t, i) => (
            <li key={t.no}>
              <span className="event__order num">{i + 1}</span>
              <bdi className="num" dir="ltr">
                S/S {t.no}
              </bdi>
              <b className="num" dir="ltr">
                {fmt(t.transferA)} A
              </b>
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}

export function Hero() {
  return (
    <header className="hero" id="home" data-glow onPointerMove={trackGlow}>
      <div className="container hero__grid">
        <div className="hero__copy">
          <span className="eyebrow" dir="ltr" lang="en">
            <i aria-hidden="true" />
            {hero.kicker}
          </span>
          <h1>
            {hero.titleLead}
            <br />
            <span className="accent">{hero.titleAccent}</span>
          </h1>
          <p className="hero__lead">{hero.lead}</p>
          <div className="actions">
            <a className="btn btn--primary" href={cta.primary.href}>
              {cta.primary.label}
              <Icon name="arrowLeft" size={18} />
            </a>
            <a className="btn btn--ghost" href={cta.secondary.href}>
              {cta.secondary.label}
            </a>
          </div>
          <ul className="facts">
            {hero.facts.map((fact) => (
              <li key={fact.key}>
                <strong className="num" dir="ltr">
                  {fact.key}
                </strong>
                <span>{fact.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero__visual">
          <EventCard />
          <ul className="legend" aria-label="مفتاح الخريطة">
            {(['full', 'high', 'limited'] as const).map((status) => (
              <li key={status}>
                <i className={`dot dot--${status}`} aria-hidden="true" />
                {statusLabel[status]}
              </li>
            ))}
            <li>
              <i className="dot dot--sensitive" aria-hidden="true" />
              مشترك حساس
            </li>
          </ul>
        </div>
      </div>

      <div className="container">
        <ol className="questions">
          {questions.map((q, i) => (
            <li key={q.title}>
              <span className="questions__no num">0{i + 1}</span>
              <strong className="questions__title">{q.title}</strong>
              <p>{q.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </header>
  )
}
