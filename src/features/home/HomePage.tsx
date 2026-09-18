import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { navLinks } from './content'
import { Contact } from './sections/Contact'
import { Hero } from './sections/Hero'
import { Monitoring } from './sections/Monitoring'
import { Solutions } from './sections/Solutions'
import { Tenders, WhyBand } from './sections/Tenders'
import { useReveal } from './useReveal'
import './HomePage.css'

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}${open ? ' nav--open' : ''}`} aria-label="التنقل الرئيسي">
      <div className="container nav__inner">
        <a href="#home" aria-label="SanadGrid — الرئيسية" onClick={close}>
          <Logo size={40} />
        </a>
        <div className="nav__links" id="nav-links">
          {navLinks.map((l) => (
            <a href={l.href} key={l.href} onClick={close}>
              {l.label}
            </a>
          ))}
          <a className="btn btn--outline" href="#contact" onClick={close}>
            تواصل معنا
          </a>
        </div>
        <button
          className="nav__toggle"
          type="button"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'close' : 'menu'} size={24} />
        </button>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <Logo size={32} />
        <div className="footer__links">
          {navLinks.map((l) => (
            <a href={l.href} key={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <span dir="ltr" lang="en">
          © {new Date().getFullYear()} SanadGrid · Saudi Arabia
        </span>
      </div>
    </footer>
  )
}

export function HomePage() {
  useReveal()

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Solutions />
        <Monitoring />
        <Tenders />
        <WhyBand />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
