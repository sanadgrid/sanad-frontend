import { Icon } from '../../../components/Icon'
import { audiences } from '../content'
import { SectionHead } from './SectionHead'

export function Audiences() {
  return (
    <section className="section" id="audiences">
      <div className="container">
        <SectionHead kicker={audiences.kicker} title={audiences.title} sub={audiences.sub} />
        <ul className="teams">
          {audiences.items.map((item, i) => (
            <li className="team reveal" key={item.team} style={{ animationDelay: `${i * 70}ms` }}>
              <div className="team__top">
                <span className="team__icon">
                  <Icon name={item.icon} size={20} />
                </span>
                <span className="chip chip--quiet">{item.when}</span>
              </div>
              <h3>{item.team}</h3>
              <p>{item.outcome}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
