import { Icon } from '../../../components/Icon'
import { trust } from '../content'
import { SectionHead } from './SectionHead'

export function Trust() {
  return (
    <section className="section section--tint" id="trust">
      <div className="container split">
        <div className="split__aside">
          <SectionHead kicker={trust.kicker} title={trust.title} sub={trust.sub} />
        </div>
        <ul className="assurances">
          {trust.items.map((item, i) => (
            <li className="assurance reveal" key={item.title} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="assurance__icon">
                <Icon name={item.icon} size={20} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
