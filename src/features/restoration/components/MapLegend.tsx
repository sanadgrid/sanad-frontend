import type { Layers } from '../filters'
import { STATUS, STATUS_ORDER } from '../labels'
import { themeColors } from '../mapTheme'
import type { Theme } from '../useTheme'

interface MapLegendProps {
  layers: Layers
  theme: Theme
}

export function MapLegend({ layers, theme }: MapLegendProps) {
  // the swatches take the colours the map itself draws with
  const colors = themeColors(theme)

  return (
    <div className="rc-legend" aria-label="مفتاح الخريطة">
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
    </div>
  )
}
