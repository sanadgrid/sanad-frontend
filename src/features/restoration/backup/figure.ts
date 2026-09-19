import { normalizeQuery } from '../import/stations'

/**
 * A figure as people type it: Arabic-Indic digits, "1,250" or "1٬250" for
 * thousands, "٫" for the decimal point. `null` for anything that is not a number ≥ 0.
 */
export function figureOf(text: string): number | null {
  const plain = normalizeQuery(text).replace(/\s/g, '').replace('٫', '.')
  const grouped = /^\d{1,3}([,٬]\d{3})+(\.\d+)?$/.test(plain) ? plain.replace(/[,٬]/g, '') : plain
  if (!/^\d+(\.\d+)?$/.test(grouped)) return null
  return Number(grouped)
}
