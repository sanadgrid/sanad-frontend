import { Icon } from '../../../components/Icon'
import { tenders, tenderStatusLabel } from '../content'
import { trackGlow } from '../glow'

export function Tenders() {
  return (
    <section className="section" id="tenders">
      <div className="container">
        <div className="section-head reveal">
          <div>
            <span className="kicker">TENDER MANAGEMENT</span>
            <h2>إدارة طرح الأعمال بوضوح.</h2>
          </div>
          <p className="sub sub--dark">
            الأعمال المطروحة ومراحل التقييم والإسناد في مسار واحد، من تجهيز نطاق العمل حتى الترسية.
          </p>
        </div>
        <div className="tenders" onPointerMove={trackGlow}>
          {tenders.map((t, i) => (
            <article className="tender reveal" data-glow key={t.ref} style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="tender__top">
                <span className={`tag tag--${t.status}`}>{tenderStatusLabel[t.status]}</span>
                <span className="tender__ref num" dir="ltr">
                  {t.ref}
                </span>
              </div>
              <h3>{t.title}</h3>
              <p>
                <Icon name="clock" size={14} /> {t.stage}
              </p>
              <div className="progress" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${t.progress}%` }} />
              </div>
              <div className="tender__foot">
                <span>تقدّم المرحلة</span>
                <b className="num">{t.progress}%</b>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function WhyBand() {
  return (
    <section className="section section--flush-top" id="why">
      <div className="container">
        <div className="why reveal">
          <div className="why__waves" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="why__copy">
            <span className="kicker kicker--ink">ALWAYS ON</span>
            <h2>
              الطاقة لا تتوقف.
              <br />
              ومراقبتها كذلك.
            </h2>
            <p>
              سند مبنية حول تدفق الطاقة واتصال الشبكة: قراءات تتحدث لحظة بلحظة، تنبيهات تصل قبل أن يتحول الحدث إلى
              انقطاع، وسجل واحد موثوق لكل أصل في الشبكة.
            </p>
            <a className="btn btn--ink" href="#contact">
              تواصل معنا <Icon name="arrowLeft" size={18} />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
