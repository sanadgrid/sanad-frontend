import type { ReactNode } from 'react'

interface PillsProps<T> {
  label: string
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
  /** One joined control instead of loose pills: for a few short options. */
  segmented?: boolean
}

export function Pills<T extends string | number | null>({ label, options, value, onChange, segmented }: PillsProps<T>) {
  return (
    <div className={segmented ? 'rc-segment' : 'rc-pills'} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
