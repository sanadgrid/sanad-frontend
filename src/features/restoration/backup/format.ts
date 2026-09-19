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

const DAY_MS = 24 * 60 * 60_000

/** "اليوم", "أمس", "قبل 5 أيام" — a deletion is remembered by the day, not the minute. */
export function deletedAgo(deletedAt: number, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - deletedAt) / DAY_MS))
  if (days === 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days === 2) return 'قبل يومين'
  return days <= 10 ? `قبل ${fmt(days)} أيام` : `قبل ${fmt(days)} يوماً`
}
