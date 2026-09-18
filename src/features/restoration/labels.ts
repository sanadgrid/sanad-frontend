import type { Limit, Status } from './engine'
import type { Construction, Switching } from './types'

export const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

export const FORECAST_LABEL = 'توقع الحمل الذروي'

/** Worst first — the order of the legend, the donut and the distribution list. */
export const STATUS_ORDER: Status[] = ['none', 'limited', 'high', 'full']

export const STATUS: Record<Status, { label: string; range: string; color: string }> = {
  full: { label: 'استعادة كاملة', range: '100%', color: '#19bd85' },
  high: { label: 'استعادة مرتفعة', range: '70–99%', color: '#f1bf37' },
  limited: { label: 'استعادة محدودة', range: '1–69%', color: '#ff7f42' },
  none: { label: 'لا توجد استعادة', range: '0%', color: '#ef476f' },
}

export const LIMIT_LABEL: Record<Limit, string> = {
  load: 'كامل حمل المغذي',
  tie: 'سعة خط الربط',
  feeder: 'سعة المغذي المستقبِل',
  station: 'السعة المؤكدة للمحطة المستقبِلة',
}

export const SWITCHING_LABEL: Record<Switching, string> = {
  remote: 'عن بُعد',
  manual: 'يدوي',
}

export const CONSTRUCTION_LABEL: Record<Construction, string> = {
  underground: 'كابل أرضي',
  overhead: 'خط هوائي',
}

// Latin digits everywhere: they sit next to units like MVA and kV
const formatters = [0, 1].map(
  (digits) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
)

export const fmt = (value: number, digits: 0 | 1 = 0) => formatters[digits].format(value)
