import { Icon } from '../../../components/Icon'
import { solutions } from '../content'

export function Solutions() {
  return (
    <section className="section section--light" id="solutions">
      <div className="container">
        <div className="section-head reveal">
          <div>
            <span className="kicker">SANADGRID CAPABILITIES</span>
            <h2>من الشبكة إلى القرار.</h2>
          </div>
          <p className="sub">
            منصة مصممة لقطاع البنية التحتية والطاقة في المملكة، تربط البيانات التشغيلية بالقرار الهندسي وإدارة
            الأعمال.
          </p>
        </div>
        <div className="pillars">
          {solutions.map((s, i) => (
            <article className="pillar reveal" key={s.title} style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="pillar__index num">0{i + 1}</span>
              <span className="pillar__icon">
                <Icon name={s.icon} size={24} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
