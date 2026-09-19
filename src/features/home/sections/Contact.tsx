import { Icon } from '../../../components/Icon'
import { contact, contactIntro } from '../content'

export function Contact() {
  return (
    <section className="section" id="contact">
      <div className="container contact">
        <div className="contact__intro reveal">
          <span className="kicker" dir="ltr" lang="en">
            {contactIntro.kicker}
          </span>
          <h2>
            {contactIntro.titleLead}
            <br />
            <span className="accent">{contactIntro.titleAccent}</span>
          </h2>
          <p className="sub">{contactIntro.text}</p>
          <div className="actions">
            <a className="btn btn--primary" href={`mailto:${contact.email}`}>
              <Icon name="mail" size={18} />
              {contactIntro.mail}
            </a>
            <a className="btn btn--ghost" href={contact.phoneHref}>
              <Icon name="phone" size={18} />
              {contactIntro.call}
            </a>
          </div>
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
