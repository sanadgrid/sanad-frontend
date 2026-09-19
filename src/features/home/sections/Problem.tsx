import { Icon } from '../../../components/Icon'
import { problem } from '../content'
import { SectionHead } from './SectionHead'

export function Problem() {
  return (
    <section className="section" id="problem">
      <div className="container split">
        <div className="split__aside">
          <SectionHead kicker={problem.kicker} title={problem.title} sub={problem.sub} />
        </div>
        <ol className="gaps">
          {problem.items.map((item, i) => (
            <li className="gap reveal" key={item.title} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="gap__icon">
                <Icon name={item.icon} size={20} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
