import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import type { AuthUser } from '../../../services/auth'
import type { NetworkSource, SectorSummary } from '../../../services/restoration'

interface TopBarProps {
  /** `null` while the network is still loading. */
  source: NetworkSource | null
  sectors: SectorSummary[]
  sectorId: string
  user: AuthUser | null
  /** A sign-in or an upload is in flight. */
  busy: boolean
  onSectorChange: (sectorId: string) => void
  onSignIn: () => void
  onSignOut: () => void
  onSeed: () => void
}

export function TopBar({ source, sectors, sectorId, user, busy, onSectorChange, onSignIn, onSignOut, onSeed }: TopBarProps) {
  return (
    <header className="rc-topbar">
      <a className="rc-topbar__brand" href="/" aria-label="SanadGrid — الرئيسية">
        <Logo size={36} />
      </a>
      <p className="rc-topbar__unit">
        التخطيط التشغيلي <span aria-hidden="true">·</span> <b>قدرة استعادة الخدمة</b>
      </p>

      <div className="rc-topbar__tools">
        {source && (
          <span className={`rc-badge rc-badge--${source}`}>
            <i aria-hidden="true" />
            {source === 'demo' ? 'بيانات عامة تجريبية' : <span lang="en">Firestore</span>}
          </span>
        )}

        <label className="rc-select rc-select--inline">
          <span>القطاع</span>
          <select value={sectorId} onChange={(e) => onSectorChange(e.target.value)}>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
        </label>

        {user && (
          <button className="rc-btn" type="button" disabled={busy} onClick={onSeed}>
            <Icon name="upload" size={15} />
            رفع البيانات التجريبية إلى <span lang="en">Firestore</span>
          </button>
        )}

        {user ? (
          <button className="rc-btn" type="button" disabled={busy} onClick={onSignOut} title={user.email ?? undefined}>
            تسجيل الخروج
          </button>
        ) : (
          <button className="rc-btn rc-btn--accent" type="button" disabled={busy} onClick={onSignIn}>
            تسجيل الدخول
          </button>
        )}
      </div>
    </header>
  )
}
