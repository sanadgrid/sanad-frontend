import { Icon } from '../../../components/Icon'
import { contact } from '../content'

export function Contact() {
  return (
    <section className="section section--flush-top" id="contact">
      <div className="container contact">
        <div className="contact__intro reveal">
          <span className="kicker">CONTACT / CONTROL SUPPORT</span>
          <h2>
            تواصل مباشر.
            <br />
            <span className="accent">ودعم أكثر كفاءة.</span>
          </h2>
          <p>للاستفسار عن المنصة أو الأعمال المطروحة، تواصل مباشرة مع مسؤول دعم التحكم.</p>
        </div>

        <article className="profile reveal" dir="ltr" lang="en">
          <div className="profile__top">
            <span className="profile__avatar">{contact.initials}</span>
            <div>
              <h3>{contact.name}</h3>
              <p>{contact.role}</p>
            </div>
          </div>
          <ul className="profile__rows">
            <li>
              <span className="profile__icon">
                <Icon name="building" size={18} />
              </span>
              <div>
                <span className="profile__label">Department</span>
                <strong>{contact.department}</strong>
              </div>
            </li>
            <li>
              <span className="profile__icon">
                <Icon name="phone" size={18} />
              </span>
              <div>
                <span className="profile__label">Mobile</span>
                <a className="num" href={contact.phoneHref}>
                  {contact.phoneDisplay}
                </a>
              </div>
            </li>
            <li>
              <span className="profile__icon">
                <Icon name="mail" size={18} />
              </span>
              <div>
                <span className="profile__label">Email</span>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </div>
            </li>
          </ul>
        </article>
      </div>
    </section>
  )
}
