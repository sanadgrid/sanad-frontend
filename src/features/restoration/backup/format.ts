import { fmt } from '../labels'

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** First backup, second backup… as the team numbers them: ١ ٢ ٣. */
export const ordinal = (index: number) => String(index + 1).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])

/** Never "100%" for a case that falls short, nor "0%" for one that restores something: the figure agrees with the class. */
export function ratioLabel(ratio: number, digits: 0 | 1 = 0): string {
  const step = digits === 1 ? 0.1 : 1
  const value = ratio >= 1 ? 100 : ratio <= 0 ? 0 : Math.min(100 - step, Math.max(step, ratio * 100))
  return `${fmt(value, digits)}%`
}

export const loadingLabel = (pct: number) => (Number.isFinite(pct) ? `${fmt(pct)}%` : '—')
