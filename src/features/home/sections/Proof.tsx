import { useMemo, useState, type CSSProperties } from 'react'
import { ILLUSTRATIVE, proof, statusLabel } from '../content'
import { pictureAt, RATING_MAX_A, RATING_MIN_A, type Picture } from '../proof/assess'
import { SECTOR_SIZE } from '../proof/dataset'
import { SectionHead } from './SectionHead'
import './Proof.css'

const SHOWN = ['full', 'high', 'limited', 'none'] as const

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const share = (ratingA: number) => (ratingA - RATING_MIN_A) / (RATING_MAX_A - RATING_MIN_A)

// computed once: the three named assumptions and what each one claims
const stops = proof.stops.map((stop) => ({ ...stop, picture: pictureAt(stop.ratingA) }))

function Matrix({ picture }: { picture: Picture }) {
  const summary = SHOWN.filter((s) => picture.byStatus[s] > 0)
    .map((s) => `${statusLabel[s]}: ${picture.byStatus[s]}`)
    .join('، ')

  return (
    <div className="calc__matrix" role="img" aria-label={`${proof.split} — ${summary}`}>
      {proof.sectors.map((sector, row) => (
        <div className="calc__sector" key={sector}>
          <span className="calc__sector-name">{sector}</span>
          <ul>
            {picture.cells.slice(row * SECTOR_SIZE, (row + 1) * SECTOR_SIZE).map((cell) => (
              <li
                className={`cell cell--${cell.status}`}
                key={cell.id}
                title={`${cell.id} · ${fmt(cell.restorableA)} / ${fmt(cell.loadA)} A · ${fmt(cell.ratio * 100)}%`}
                style={{ '--ratio': cell.ratio } as CSSProperties}
              >
                <i />
                <span className="num">{cell.id.slice(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function Proof() {
  const [ratingA, setRatingA] = useState(RATING_MAX_A)
  const picture = useMemo(() => pictureAt(ratingA), [ratingA])
  const percent = picture.percent.toFixed(1)
  const stop = stops.find((s) => s.ratingA === ratingA)

  return (
    <section className="section" id="proof">
      <div className="container">
        <SectionHead kicker={proof.kicker} title={proof.title} sub={proof.sub} centered />

        <div className="calc reveal">
          <div className="calc__panel">
            <div className="calc__rating">
              <label htmlFor="calc-rating">{proof.ratingLabel}</label>
              <strong className="num" dir="ltr">
                {ratingA} <small>A</small>
              </strong>
              <span className={`calc__stop-name${stop ? '' : ' calc__stop-name--off'}`}>{stop ? stop.label : 'بين افتراضين'}</span>
              {/* on a phone the full result sits below the fold of this panel */}
              <span className="calc__mini" aria-hidden="true">
                <i className={`dot dot--${picture.status}`} />
                {proof.restored}
                <b className="num" dir="ltr">
                  {percent}%
                </b>
              </span>
            </div>

            <div className="calc__slider" style={{ '--p': share(ratingA) } as CSSProperties}>
              <input
                id="calc-rating"
                type="range"
                dir="ltr"
                min={RATING_MIN_A}
                max={RATING_MAX_A}
                step={1}
                value={ratingA}
                onChange={(e) => setRatingA(Number(e.target.value))}
                aria-valuetext={`${ratingA} أمبير — يُستعاد ${percent}٪ من الحمل`}
              />
              <div className="calc__ticks num" dir="ltr" aria-hidden="true">
                {stops.map((s) => (
                  <span key={s.ratingA} style={{ '--p': share(s.ratingA) } as CSSProperties}>
                    {s.ratingA}
                  </span>
                ))}
              </div>
            </div>

            <div className="calc__stops" role="group" aria-label="افتراضات جاهزة للسعة">
              {stops.map((s) => (
                <button type="button" key={s.ratingA} aria-pressed={s.ratingA === ratingA} onClick={() => setRatingA(s.ratingA)}>
                  <span className="calc__stop-label">
                    {s.label}{' '}
                    <bdi className="num" dir="ltr">
                      {s.ratingA}
                    </bdi>
                  </span>
                  <span className="calc__stop-hint">{s.hint}</span>
                  <b className="num" dir="ltr">
                    <i className={`dot dot--${s.picture.status}`} aria-hidden="true" />
                    {s.picture.percent.toFixed(1)}%
                  </b>
                </button>
              ))}
            </div>

            <div className="calc__method">
              <strong>{proof.methodTitle}</strong>
              <p>{proof.method}</p>
            </div>
          </div>

          <div className="calc__result">
            <div className="calc__headline">
              <div className="calc__big">
                <span>{proof.restored}</span>
                <strong className="num" dir="ltr" data-testid="calc-percent">
                  {percent}
                  <small>%</small>
                </strong>
                <em className={`calc__status calc__status--${picture.status}`}>
                  <i className={`dot dot--${picture.status}`} aria-hidden="true" />
                  {statusLabel[picture.status]}
                </em>
              </div>
              <div className="calc__side">
                <span>{proof.unrestored}</span>
                <strong className="num" dir="ltr" data-testid="calc-unrestored">
                  {fmt(picture.unrestorableA)} <small>A</small>
                </strong>
                <em className="num" dir="ltr">
                  ≈ {fmt(picture.unrestorableMva, 1)} MVA
                </em>
              </div>
            </div>

            <div className="calc__split">
              <div className="calc__split-head">
                <span>{proof.split}</span>
                <span className="chip chip--quiet">{ILLUSTRATIVE}</span>
              </div>
              <div className="calc__bar" aria-hidden="true">
                {SHOWN.map((s) => (
                  <i className={`fill--${s}`} key={s} style={{ flexGrow: picture.byStatus[s] }} />
                ))}
              </div>
              <ul className="calc__legend">
                {SHOWN.slice(0, 3).map((s) => (
                  <li key={s}>
                    <i className={`dot dot--${s}`} aria-hidden="true" />
                    {statusLabel[s]}
                    <b className="num" data-testid={`calc-${s}`}>
                      {picture.byStatus[s]}
                    </b>
                  </li>
                ))}
              </ul>
            </div>

            <Matrix picture={picture} />
            <p className="calc__note">{proof.note}</p>
          </div>

          <p className="sr-only" role="status">
            {`عند ${ratingA} أمبير يُستعاد ${percent}٪ من الحمل، ويبقى ${fmt(picture.unrestorableA)} أمبير غير مستعاد.`}
          </p>
        </div>

        <p className="calc__takeaway reveal">
          الجدول ذو السعة الثابتة يقول{' '}
          <b className="num" dir="ltr">
            {stops[0].picture.percent.toFixed(1)}%
          </b>
          . صيف واقعي يقول{' '}
          <b className="num" dir="ltr">
            {stops[1].picture.percent.toFixed(1)}%
          </b>
          . الفرق ليس في الشبكة — بل في الافتراض.
        </p>
      </div>
    </section>
  )
}
