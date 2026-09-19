import { AppVersion } from '../../../components/AppVersion'
import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import type { AuthUser } from '../../../services/auth'
import type { NetworkSource, SectorSummary } from '../../../services/restoration'
import type { Theme } from '../useTheme'

interface TopBarProps {
  /** `null` while the network is still loading. */
  source: NetworkSource | null
  sectors: SectorSummary[]
  sectorId: string
  /** `null` only in the test build that has nobody to sign in. */
  user: AuthUser | null
  /** A sign-out or an upload is in flight. */
  busy: boolean
  /** Admins may import map layers, once there is a sector to import them into. */
  canImport: boolean
  /** Admins may publish the demo network. */
  canPublish: boolean
  theme: Theme
  onToggleTheme: () => void
  onSectorChange: (sectorId: string) => void
  onSignOut: () => void
  onSeed: () => void
  onImport: () => void
}

export function TopBar({
  source,
  sectors,
  sectorId,
  user,
  busy,
  canImport,
  canPublish,
  theme,
  onToggleTheme,
  onSectorChange,
  onSignOut,
  onSeed,
  onImport,
}: TopBarProps) {
  // the button names the theme it switches to
  const otherTheme = theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'

  return (
    <header className="rc-topbar">
      <a className="rc-topbar__brand" href="/" aria-label="SanadGrid — الرئيسية">
        <Logo size={36} tone={theme === 'dark' ? 'onDark' : 'onLight'} />
      </a>
      <p className="rc-topbar__unit">
        التخطيط التشغيلي <span aria-hidden="true">·</span> <b>قدرة استعادة الخدمة</b>
        <span className="rc-topbar__version">
          <AppVersion />
        </span>
      </p>

      <div className="rc-topbar__tools">
        {source && (
          <span className={`rc-badge rc-badge--${source}`}>
            <i aria-hidden="true" />
            {source === 'demo' ? 'بيانات عامة تجريبية' : 'بيانات مباشرة'}
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

        <button className="rc-icon-btn rc-icon-btn--bar" type="button" aria-label={otherTheme} title={otherTheme} onClick={onToggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
        </button>

        {canImport && (
          <button className="rc-btn" type="button" disabled={busy} onClick={onImport}>
            <Icon name="layers" size={15} />
            استيراد طبقات الخريطة
          </button>
        )}

        {canPublish && (
          <button className="rc-btn" type="button" disabled={busy} onClick={onSeed}>
            <Icon name="upload" size={15} />
            نشر البيانات التجريبية
          </button>
        )}

        {user && (
          <button className="rc-btn" type="button" disabled={busy} onClick={onSignOut} title={user.email ?? undefined}>
            تسجيل الخروج
          </button>
        )}
      </div>
    </header>
  )
}
