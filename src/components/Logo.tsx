import { useId } from 'react'

interface LogoProps {
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number
  withWordmark?: boolean
  /** `onDark` = white wordmark, `onLight` = navy wordmark. */
  tone?: 'onDark' | 'onLight'
}

// The mark: an "S" drawn as a transmission line routed between two substations.
// Static copies for use outside React live in public/brand/.
export function Logo({ size = 40, withWordmark = true, tone = 'onDark' }: LogoProps) {
  const gradientId = useId()

  return (
    <span className={`logo logo--${tone}`} dir="ltr">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0A3B8F" />
            <stop offset="1" stopColor="#00B3C6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
        <path
          d="M44 16H28a8 8 0 0 0 0 16h8a8 8 0 0 1 0 16H20"
          fill="none"
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="44" cy="16" r="5.5" fill="#fff" />
        <circle cx="44" cy="16" r="2.25" fill="#0A3B8F" />
        <circle cx="20" cy="48" r="5.5" fill="#fff" />
        <circle cx="20" cy="48" r="2.25" fill="#00B3C6" />
      </svg>
      {withWordmark && (
        <span className="logo__text">
          <span className="logo__word" style={{ fontSize: size * 0.58 }}>
            sanad<b>grid</b>
          </span>
          <span className="logo__tag" style={{ fontSize: Math.max(7, size * 0.18) }}>
            POWER TRANSMISSION SOLUTIONS
          </span>
        </span>
      )}
    </span>
  )
}
