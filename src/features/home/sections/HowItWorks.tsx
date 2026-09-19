import { Icon } from '../../../components/Icon'
import { how } from '../content'
import { SectionHead } from './SectionHead'

export function HowItWorks() {
  return (
    <section className="section section--tint" id="how">
      <div className="container">
        <SectionHead kicker={how.kicker} title={how.title} centered />
        <ol className="steps">
          {how.steps.map((step, i) => (
            <li className="step reveal" key={step.title} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="step__top">
                <span className="step__icon">
                  <Icon name={step.icon} size={22} />
                </span>
                <span className="step__no num">0{i + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <ul className="step__points">
                {step.points.map((point) => (
                  <li key={point}>
                    <Icon name="check" size={14} />
                    {point}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
