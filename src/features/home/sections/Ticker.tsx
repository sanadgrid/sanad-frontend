import { ticker } from '../content'

// Endless strip of headline readings. The list is rendered twice so the loop is seamless.
export function Ticker() {
  return (
    <div className="ticker" dir="ltr" lang="en" aria-label="Headline grid readings (illustrative)">
      <div className="ticker__track">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1}>
            {ticker.map((t) => (
              <li key={t.label}>
                <span>{t.label}</span>
                <b className="num">{t.value}</b>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
