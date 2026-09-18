import { Icon } from '../../../components/Icon'
import type { Layers } from '../filters'
import { STATUS, STATUS_ORDER } from '../labels'
import { themeColors } from '../mapTheme'
import type { Theme } from '../useTheme'

interface MapLegendProps {
  layers: Layers
  theme: Theme
  open: boolean
  onToggle: () => void
}

export function MapLegend({ layers, theme, open, onToggle }: MapLegendProps) {
  // the swatches take the colours the map itself draws with
  const colors = themeColors(theme)

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
          <i className="rc-legend__dot rc-legend__dot--size" /> حجم الدائرة = حمل المحطة
        </li>
      </ul>
      {layers.ties && (
        <ul>
          <li>
            <i className="rc-legend__line" style={{ color: colors.tieUnderground }} /> ربط أرضي
          </li>
          <li>
            <i className="rc-legend__line rc-legend__line--overhead" style={{ color: colors.tieOverhead }} /> ربط هوائي
          </li>
          <li>
            <i className="rc-legend__line rc-legend__line--double" style={{ color: colors.tieUnderground }} /> دائرتان
          </li>
          <li>
            <i className="rc-legend__line" style={{ color: colors.tieWeak }} /> ربط بمحطة ضعيفة الاستعادة
          </li>
        </ul>
      )}
      {(layers.sensitive || layers.vip) && (
        <ul>
          {layers.sensitive && (
            <li>
              <i className="rc-legend__ring" style={{ color: colors.sensitive }} /> مشتركون حساسون
            </li>
          )}
          {layers.vip && (
            <li>
              <i className="rc-legend__ring rc-legend__ring--dashed" style={{ color: colors.vip }} /> كبار المشتركين
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
