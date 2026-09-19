import { AppVersion } from '../../../components/AppVersion'
import { Icon } from '../../../components/Icon'
import { Logo } from '../../../components/Logo'
import type { AuthUser } from '../../../services/auth'
import type { SectorSummary } from '../sectors'
import type { Theme } from '../useTheme'
import { DataMenu, type DataAction } from './DataMenu'

interface TopBarProps {
  /** What the plans on screen are: real readings, or loads assumed for a presentation. `null` without plans. */
  dataKind: 'real' | 'demo' | null
  sectors: SectorSummary[]
  sectorId: string
  /** `null` only in the test build that has nobody to sign in. */
  user: AuthUser | null
  /** A sign-out or a write is in flight. */
  busy: boolean
  /** What an admin may do to the sector's data; empty for everybody else. */
  dataActions: DataAction[]
  theme: Theme
  onToggleTheme: () => void
  onSectorChange: (sectorId: string) => void
  onSignOut: () => void
}

const BADGE = { real: 'بيانات فعلية', demo: 'بيانات تجريبية' }

export function TopBar({ dataKind, sectors, sectorId, user, busy, dataActions, theme, onToggleTheme, onSectorChange, onSignOut }: TopBarProps) {
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
        {dataKind && (
          <span className={`rc-badge rc-badge--${dataKind}`}>
            <i aria-hidden="true" />
            {BADGE[dataKind]}
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

        {dataActions.length > 0 && <DataMenu actions={dataActions} busy={busy} />}

        {user && (
          <button className="rc-btn" type="button" disabled={busy} onClick={onSignOut} title={user.email ?? undefined}>
            تسجيل الخروج
          </button>
        )}
      </div>
    </header>
  )
}
