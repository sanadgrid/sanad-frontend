import { useEffect, useRef, useState } from 'react'
import { AppVersion } from '../../components/AppVersion'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { cta, footer, navLinks, signIn } from './content'
import { Audiences } from './sections/Audiences'
import { Capabilities } from './sections/Capabilities'
import { ConsolePreview } from './sections/ConsolePreview'
import { Contact } from './sections/Contact'
import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { Problem } from './sections/Problem'
import { Proof } from './sections/Proof'
import { Trust } from './sections/Trust'
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
          <Logo size={42} tone="onLight" />
        </a>
        <div className="nav__links" id="nav-links">
          {navLinks.map((l) => (
            <a href={l.href} key={l.href} onClick={close} aria-current={active === l.href ? 'true' : undefined}>
              {l.label}
            </a>
          ))}
          <a className="btn btn--signin nav__signin--menu" href={signIn.href}>
            <Icon name="user" size={17} />
            {signIn.label}
          </a>
          <a className="btn btn--nav" href={cta.primary.href} onClick={close}>
            {cta.nav}
          </a>
        </div>
        {/* phones: sign-in stays in the collapsed bar, beside the menu button */}
        <a className="btn btn--signin nav__signin--bar" href={signIn.href} aria-label={signIn.label}>
          <Icon name="user" size={18} />
          <span>{signIn.label}</span>
        </a>
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
        <div className="footer__brand">
          <Logo size={34} tone="onLight" />
          <p>{footer.line}</p>
        </div>
        <div className="footer__links">
          {navLinks.map((l) => (
            <a href={l.href} key={l.href}>
              {l.label}
            </a>
          ))}
          <a className="footer__signin" href={signIn.href}>
            <Icon name="lock" size={14} />
            {signIn.footerLabel}
          </a>
        </div>
        <span className="footer__meta">
          <span dir="ltr" lang="en">
            © {new Date().getFullYear()} SanadGrid · Saudi Arabia
          </span>
          <AppVersion />
        </span>
      </div>
    </footer>
  )
}

export function HomePage() {
  useReveal()

  return (
    <div className="home">
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <Capabilities />
        <Proof />
        <ConsolePreview />
        <Audiences />
        <Trust />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}
