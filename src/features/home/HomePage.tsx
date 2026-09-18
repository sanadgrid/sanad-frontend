import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { navLinks } from './content'
import { Contact } from './sections/Contact'
import { Hero } from './sections/Hero'
import { Monitoring } from './sections/Monitoring'
import { Network } from './sections/Network'
import { Solutions } from './sections/Solutions'
import { Tenders, WhyBand } from './sections/Tenders'
import { Ticker } from './sections/Ticker'
import { useReveal } from './useReveal'
import './HomePage.css'
import './HomePage.motion.css'

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')
  const progress = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40)
      const max = document.documentElement.scrollHeight - window.innerHeight
      progress.current?.style.setProperty('--progress', String(max > 0 ? window.scrollY / max : 0))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // highlight the link of the section currently crossing the middle of the screen
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(`#${entry.target.id}`)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    document.querySelectorAll('main > [id]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const close = () => setOpen(false)

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}${open ? ' nav--open' : ''}`} aria-label="التنقل الرئيسي">
      <div className="container nav__inner">
        <a href="#home" aria-label="SanadGrid — الرئيسية" onClick={close}>
          <Logo size={42} />
        </a>
        <div className="nav__links" id="nav-links">
          {navLinks.map((l) => (
            <a href={l.href} key={l.href} onClick={close} aria-current={active === l.href ? 'true' : undefined}>
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
      <span className="nav__progress" ref={progress} aria-hidden="true" />
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
        <Ticker />
        <Solutions />
        <Monitoring />
        <Network />
        <Tenders />
        <WhyBand />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
