import type { CSSProperties } from 'react'
import type { Range } from '../filters'
import { fmt } from '../labels'

interface RangeSliderProps {
  label: string
  unit: string
  bounds: Range
  value: Range
  step?: number
  onChange: (value: Range) => void
}

// Two native range inputs on one track: keyboard and screen-reader support come
// for free. The track is LTR like any numeric axis, even inside the RTL page.
export function RangeSlider({ label, unit, bounds, value, step = 1, onChange }: RangeSliderProps) {
  const [min, max] = bounds
  const [low, high] = value
  const position = (n: number) => `${((n - min) / (max - min || 1)) * 100}%`

  return (
    <div className="rc-range" role="group" aria-label={label}>
      <div className="rc-range__head">
        <span>{label}</span>
        <span className="num" dir="ltr">
          {fmt(low)} – {fmt(high)} {unit}
        </span>
      </div>
      <div
        className="rc-range__track"
        dir="ltr"
        style={{ '--low': position(low), '--high': position(high) } as CSSProperties}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={`${label} — الحد الأدنى`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), high), high])}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={`${label} — الحد الأعلى`}
          onChange={(e) => onChange([low, Math.max(Number(e.target.value), low)])}
        />
      </div>
    </div>
  )
}
