import { useId } from 'react'
import './Logo.css'

interface LogoProps {
  /** Height of the mark in px; the wordmark scales with it. */
  size?: number
  withWordmark?: boolean
  /** `onDark` = white wordmark, `onLight` = navy wordmark. */
  tone?: 'onDark' | 'onLight'
}

// The mark: «سند» in square Kufic — a script drawn on a grid. The baseline is the
// feeder and the dot of the ن is an energised node.
// [x, y, width, height] on a 64×64 tile; pieces overlap so no seams show.
const strokes = [
  [6.15, 42.6, 51.7, 4.7], // baseline
  [15.55, 23.8, 4.7, 23.5], // د
  [6.15, 23.8, 14.1, 4.7],
  [24.95, 28.5, 4.7, 18.8], // ن
  [34.35, 28.5, 4.7, 18.8], // س
  [43.75, 28.5, 4.7, 18.8],
  [53.15, 28.5, 4.7, 18.8],
]
const node = { cx: 27.3, cy: 21.45 }
const gridLines = Array.from({ length: 7 }, (_, i) => `M${8 * (i + 1)} 0V64M0 ${8 * (i + 1)}H64`).join('')

// Static copies for use outside React live in public/brand/.
export function Logo({ size = 40, withWordmark = true, tone = 'onDark' }: LogoProps) {
  const id = useId()

  return (
    <span className={`logo logo--${tone}`} dir="ltr">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}bg`} x1="4" y1="0" x2="60" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#06245C" />
            <stop offset=".55" stopColor="#0A5CC2" />
            <stop offset="1" stopColor="#00B8CC" />
          </linearGradient>
          <radialGradient id={`${id}glow`}>
            <stop stopColor="#B6FBFF" stopOpacity=".95" />
            <stop offset="1" stopColor="#5FE6F0" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}clip`}>
            <rect width="64" height="64" rx="15" />
          </clipPath>
        </defs>
        <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />
        <path
          d={gridLines}
          clipPath={`url(#${id}clip)`}
          stroke="#fff"
          strokeOpacity=".09"
          strokeWidth=".6"
          fill="none"
        />
        <g fill="#fff">
          {strokes.map(([x, y, width, height]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} rx=".9" />
          ))}
        </g>
        <circle className="logo__glow" {...node} r="7.5" fill={`url(#${id}glow)`} />
        <circle {...node} r="2.9" fill="#D9FDFF" />
      </svg>
      {withWordmark && (
        <span className="logo__text">
          <span className="logo__word" style={{ fontSize: size * 0.58 }}>
            sanad<b>grid</b>
          </span>
          <span className="logo__tag" style={{ fontSize: Math.max(7, size * 0.18) }}>
            POWER DISTRIBUTION SOLUTIONS
          </span>
        </span>
      )}
    </span>
  )
}
