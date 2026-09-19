import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Logo } from '../../components/Logo'
import type { Access, Verdict } from '../../services/access'
import { canSignIn, checkAccess, forgetAccess, onAuthChange, signInWithGoogle, signOutUser, type AuthUser } from '../../services/auth'
import { useTheme } from './useTheme'
import './tokens.css'
import './RestorationGate.css'

// The dashboard is private. Nothing of it — its code, the map library, the
// database client — is downloaded until somebody is signed in
// AND the database has confirmed they are an admin or a member of a sector.
// This file and what it imports are all that anybody else ever receives.
const RestorationPage = lazy(() => import('./RestorationPage').then((m) => ({ default: m.RestorationPage })))

/*
 * TEST ONLY. Automated browser tests must never touch the live database, so they
 * run on a build WITHOUT the project's keys — where nobody can sign in, and the
 * gate would stay shut. `VITE_E2E_OPEN=1` opens that build on a dashboard without
 * plans or layers. It is honoured only when the keys are absent: vite.config.ts turns
 * `__E2E_OPEN__` into a plain `false` for a build that can reach the real
 * project, so what follows is not even part of that build — and `!canSignIn`
 * says the same once more at run time. `?gate=<state>` then shows one of the
 * closed states for a screenshot.
 */
const E2E_OPEN = __E2E_OPEN__ && !canSignIn
const E2E_VISITOR: Access = { role: 'member', sectors: [] }
const E2E_USER: AuthUser = { uid: 'preview', displayName: null, email: 'name@example.com' }

type Gate =
  | { kind: 'checking' | 'signedOut' | 'unavailable' }
  | { kind: 'denied' | 'unverified'; user: AuthUser }
  | { kind: 'open'; user: AuthUser | null; access: Access }

const GATE_TITLE = 'سند | SanadGrid'
const SIGN_IN_FAILED = 'تعذّر تسجيل الدخول. حاول مرة أخرى.'
const SIGN_IN_CLOSED = 'أُغلقت نافذة تسجيل الدخول قبل إتمام العملية.'
const SIGN_OUT_FAILED = 'تعذّر تسجيل الخروج. حاول مرة أخرى.'
const CLOSED_POPUP_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']
// asked twice and refused twice: the answer the database gave at the door no longer holds
const MAX_LOSSES = 2

function signInFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  return CLOSED_POPUP_CODES.includes(code) ? SIGN_IN_CLOSED : SIGN_IN_FAILED
}

function previewGate(): Gate | null {
  if (!E2E_OPEN) return null
  const kind = new URLSearchParams(location.search).get('gate')
  if (kind === 'checking' || kind === 'signedOut' || kind === 'unavailable') return { kind }
  if (kind === 'denied' || kind === 'unverified') return { kind, user: E2E_USER }
  return { kind: 'open', user: null, access: E2E_VISITOR }
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export function RestorationGate() {
  // `undefined` until the stored session, if there is one, has been restored
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [checked, setChecked] = useState<{ uid: string; verdict: Verdict } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [losses, setLosses] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [theme] = useTheme()

  useEffect(() => (canSignIn ? onAuthChange(setUser) : undefined), [])

  const uid = user?.uid
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    checkAccess(uid).then((verdict) => {
      if (!cancelled) setChecked({ uid, verdict })
    })
    return () => {
      cancelled = true
    }
  }, [uid, attempt])

  // The address is not advertised, and neither is what is behind it: search
  // engines are told to stay away, and the tab says nothing until the gate passes.
  // A layout effect: when the dashboard mounts in the same commit as the gate, its
  // own (later) effect must be the one that names the tab.
  useLayoutEffect(() => {
    const previous = document.title
    document.title = GATE_TITLE
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    return () => {
      document.title = previous
      robots.remove()
    }
  }, [])

  const gate = ((): Gate => {
    const preview = previewGate()
    if (preview) return preview
    if (!canSignIn) return { kind: 'unavailable' }
    if (user === undefined) return { kind: 'checking' }
    if (!user) return { kind: 'signedOut' }
    if (checked?.uid !== user.uid) return { kind: 'checking' }
    const { verdict } = checked
    if (verdict.status === 'unverified') return { kind: 'unverified', user }
    if (verdict.status === 'denied' || losses >= MAX_LOSSES) return { kind: 'denied', user }
    return { kind: 'open', user, access: verdict.access }
  })()

  const askAgain = useCallback(() => {
    setChecked(null)
    setAttempt((n) => n + 1)
  }, [])

  // The database refused somebody the gate had let in — their access was taken
  // away, or what the browser remembered was not true. Ask the database again.
  // Stable, because the page restarts its load whenever this changes.
  const accessLost = useCallback(() => {
    forgetAccess()
    setLosses((n) => n + 1)
    askAgain()
  }, [askAgain])

  const run = async (task: () => Promise<void>, failed: (error: unknown) => string) => {
    setBusy(true)
    setProblem(null)
    try {
      await task()
    } catch (error) {
      console.error('gate:', error)
      setProblem(failed(error))
    } finally {
      setBusy(false)
    }
  }
  const signIn = (chooseAccount: boolean) => run(() => signInWithGoogle(chooseAccount), signInFailure)
  const signOut = () => run(signOutUser, () => SIGN_OUT_FAILED)

  const card = (children?: ReactNode) => (
    <div className="rc rc-gate" data-theme={theme}>
      <main className="rc-gate__card" aria-busy={gate.kind === 'checking' || gate.kind === 'open'}>
        <a className="rc-gate__brand" href="/" aria-label="SanadGrid — الرئيسية">
          <Logo size={44} tone={theme === 'dark' ? 'onDark' : 'onLight'} />
        </a>
        {children ?? (
          <div className="rc-gate__spinner" role="status">
            <span className="rc-gate__sr">جارٍ التحقق…</span>
          </div>
        )}
        {children && problem && (
          <p className="rc-gate__problem" role="alert">
            {problem}
          </p>
        )}
        {children && (
          <a className="rc-gate__home" href="/">
            العودة إلى الصفحة الرئيسية
          </a>
        )}
      </main>
    </div>
  )

  switch (gate.kind) {
    case 'open':
      return (
        <Suspense fallback={card()}>
          <RestorationPage user={gate.user} access={gate.access} onAccessLost={accessLost} />
        </Suspense>
      )
    case 'checking':
      return card()
    case 'signedOut':
      return card(
        <>
          <h1>هذه الصفحة مخصصة للمستخدمين المصرّح لهم</h1>
          <p>سجّل الدخول للمتابعة</p>
          <div className="rc-gate__actions">
            <button className="rc-gate__btn rc-gate__btn--google" type="button" disabled={busy} onClick={() => signIn(false)}>
              <GoogleMark />
              تسجيل الدخول بحساب Google
            </button>
          </div>
        </>,
      )
    case 'denied':
      return card(
        <>
          <h1>حسابك غير مصرّح له بالوصول إلى هذه الصفحة</h1>
          {gate.user.email && (
            <p className="rc-gate__account" dir="ltr" lang="en">
              {gate.user.email}
            </p>
          )}
          <p>تواصل مع مسؤول النظام</p>
          <div className="rc-gate__actions">
            <button className="rc-gate__btn rc-gate__btn--accent" type="button" disabled={busy} onClick={() => signIn(true)}>
              تجربة حساب آخر
            </button>
            <button className="rc-gate__btn" type="button" disabled={busy} onClick={signOut}>
              تسجيل الخروج
            </button>
          </div>
        </>,
      )
    case 'unverified':
      return card(
        <>
          <h1>تعذّر التحقق من الصلاحية الآن</h1>
          <p>حاول مرة أخرى بعد قليل</p>
          <div className="rc-gate__actions">
            <button className="rc-gate__btn rc-gate__btn--accent" type="button" disabled={busy} onClick={askAgain}>
              إعادة المحاولة
            </button>
            <button className="rc-gate__btn" type="button" disabled={busy} onClick={signOut}>
              تسجيل الخروج
            </button>
          </div>
        </>,
      )
    case 'unavailable':
      return card(<h1>هذه الصفحة غير متاحة حالياً</h1>)
  }
}
