import type { Layers } from '../filters'
import { MAP_COLORS, STATUS, STATUS_ORDER } from '../labels'

interface MapLegendProps {
  layers: Layers
}

export function MapLegend({ layers }: MapLegendProps) {
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
            <i className="rc-legend__line" /> ربط أرضي
          </li>
          <li>
            <i className="rc-legend__line rc-legend__line--overhead" /> ربط هوائي
          </li>
          <li>
            <i className="rc-legend__line rc-legend__line--double" /> دائرتان
          </li>
          <li>
            <i className="rc-legend__line" style={{ color: MAP_COLORS.tieWeak }} /> ربط بمحطة ضعيفة الاستعادة
          </li>
        </ul>
      )}
      {(layers.sensitive || layers.vip) && (
        <ul>
          {layers.sensitive && (
            <li>
              <i className="rc-legend__ring" style={{ color: MAP_COLORS.sensitive }} /> مشتركون حساسون
            </li>
          )}
          {layers.vip && (
            <li>
              <i className="rc-legend__ring rc-legend__ring--dashed" style={{ color: MAP_COLORS.vip }} /> كبار المشتركين
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
