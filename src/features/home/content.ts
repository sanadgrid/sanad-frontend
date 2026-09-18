import type { IconName } from '../../components/Icon'

// Everything the landing page displays. Figures are illustrative until the
// platform is wired to live data through `services/`.

export const navLinks = [
  { href: '#solutions', label: 'الحلول' },
  { href: '#monitoring', label: 'المراقبة' },
  { href: '#tenders', label: 'طرح الأعمال' },
  { href: '#why', label: 'لماذا سند' },
]

export const heroStats = [
  { value: 230, suffix: ' kV+', label: 'شبكات نقل الطاقة' },
  { value: 1286, suffix: '', label: 'أصل قابل للمراقبة' },
  { value: 99.2, suffix: '%', label: 'جاهزية تشغيلية', decimals: 1 },
]

export const solutions: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'bolt',
    title: 'قراءات لحظية',
    text: 'عرض الجهد، التيار، القدرة، التردد والمؤشرات المهمة من واجهة واحدة واضحة.',
  },
  {
    icon: 'activity',
    title: 'مراقبة الشبكة',
    text: 'متابعة حالة الأصول والتنبيهات والأحداث التشغيلية مع تصور حي للشبكة.',
  },
  {
    icon: 'layers',
    title: 'إدارة الأصول',
    text: 'بيانات موحدة للمحطات والخطوط والمعدات مع الحالة والتاريخ التشغيلي.',
  },
  {
    icon: 'file',
    title: 'طرح الأعمال',
    text: 'إدارة نطاقات العمل والمناقصات والتقييم والمواعيد والإسناد بطريقة منظمة.',
  },
]

export const dashboardNav: { icon: IconName; label: string }[] = [
  { icon: 'dashboard', label: 'Dashboard' },
  { icon: 'bolt', label: 'Grid Monitoring' },
  { icon: 'layers', label: 'Assets' },
  { icon: 'map', label: 'Network Map' },
  { icon: 'chart', label: 'Analytics' },
  { icon: 'file', label: 'Tenders' },
  { icon: 'sliders', label: 'Settings' },
]

export const kpis = [
  { label: 'Transmission Capacity', value: 5240, unit: 'MW', note: '+2.4% vs last week' },
  { label: 'Active Substations', value: 28, unit: '', note: 'All operational' },
  { label: 'Grid Voltage (avg)', value: 230.4, unit: 'kV', note: 'Within range', decimals: 1 },
  { label: 'Assets Online', value: 99.2, unit: '%', note: 'High availability', decimals: 1 },
]

export const assetStatus = [
  { label: 'Healthy', share: 72, color: '#00b3c6' },
  { label: 'Scheduled maintenance', share: 20, color: '#1668e3' },
  { label: 'Warning', share: 5, color: '#e7a750' },
  { label: 'Critical', share: 3, color: '#ec6b62' },
]

export type TenderStatus = 'open' | 'evaluation' | 'upcoming'

export const tenderStatusLabel: Record<TenderStatus, string> = {
  open: 'مفتوح',
  evaluation: 'قيد التقييم',
  upcoming: 'قادم',
}

// \u2066…\u2069 (LRI/PDI) keep a Latin run in reading order inside an Arabic title.
export const tenders: {
  ref: string
  title: string
  stage: string
  status: TenderStatus
  progress: number
}[] = [
  { ref: 'SG-230-041', title: 'توريد معدات \u2066230 kV GIS\u2069', stage: 'الإغلاق 25 سبتمبر', status: 'open', progress: 72 },
  { ref: 'SG-230-057', title: 'تطوير منظومة SCADA', stage: 'التقييم الفني', status: 'evaluation', progress: 54 },
  { ref: 'SG-230-063', title: 'مراقبة خطوط النقل الذكية', stage: 'تجهيز نطاق العمل', status: 'upcoming', progress: 34 },
  { ref: 'SG-230-068', title: 'توسعة محطة نقل رئيسية', stage: 'استقبال العروض', status: 'open', progress: 81 },
]

export const contact = {
  initials: 'YA',
  name: 'Yasser A. Alghamdi',
  role: 'Div. Manager, Distribution Control Support',
  department: 'Control Support Division',
  phoneDisplay: '056 000 2843',
  phoneHref: 'tel:+966560002843',
  email: 'yaghamdi2@se.com.sa',
}
