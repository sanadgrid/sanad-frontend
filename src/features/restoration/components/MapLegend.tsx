import { Icon } from '../../../components/Icon'
import { STATUS, STATUS_ORDER } from '../labels'

interface MapLegendProps {
  open: boolean
  onToggle: () => void
}

const LINKS = [
  { level: 'calm', label: 'تحميل البديل حتى', range: '80%' },
  { level: 'near', label: 'تحميل البديل', range: '80–100%' },
  { level: 'over', label: 'البديل فوق سعته', range: '>100%' },
]

export function MapLegend({ open, onToggle }: MapLegendProps) {
  if (!open)
    return (
      <button className="rc-float rc-legend-toggle" type="button" aria-expanded={false} onClick={onToggle}>
        <Icon name="list" size={15} />
        مفتاح الخريطة
      </button>
    )

  return (
    <section className="rc-float rc-legend" aria-label="مفتاح الخريطة">
      <header>
        <h2>مفتاح الخريطة</h2>
        <button className="rc-icon-btn rc-icon-btn--small" type="button" aria-expanded aria-label="طيّ مفتاح الخريطة" title="طيّ" onClick={onToggle}>
          <Icon name="chevronDown" size={15} />
        </button>
      </header>
      <ul>
        {STATUS_ORDER.map((status) => (
          <li key={status}>
            <i className="rc-legend__dot" style={{ background: STATUS[status].color }} />
            {STATUS[status].label}
            <span className="num" dir="ltr">
              {STATUS[status].range}
            </span>
          </li>
        ))}
        <li>
          <i className="rc-legend__dot rc-legend__dot--size" /> حجم الدائرة = حمل العنصر الرئيسي
        </li>
        <li>
          <i className="rc-legend__support" /> بديل فقط — الرقم بجانبه أعلى تحميل له
        </li>
      </ul>
      <ul>
        {LINKS.map(({ level, label, range }) => (
          <li key={level}>
            <i className={`rc-legend__link rc-net-link--${level}`} />
            {label}
            <span className="num" dir="ltr">
              {range}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
