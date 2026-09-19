import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import { BASEMAPS, type Basemap } from '../useBasemap'

interface FilterPanelProps {
  /** Filters that narrow the plans right now. */
  activeCount: number
  /** The switch and the rating every figure rests on. */
  assumptions: ReactNode
  /** What narrows the plans; absent while there are none. */
  filters?: ReactNode
  /** The sector's imported layers, when the user may see any. */
  importedLayers?: ReactNode
  basemap: Basemap
  onBasemap: (basemap: Basemap) => void
  /** Opens the backup plans; present for a signed-in user only. */
  onPlans?: () => void
  onReset: () => void
  onCollapse: () => void
}

const BASEMAP_LABEL: Record<Basemap, string> = { faint: 'باهت', medium: 'متوسط', clear: 'واضح' }

export function FilterPanel({ activeCount, assumptions, filters, importedLayers, basemap, onBasemap, onPlans, onReset, onCollapse }: FilterPanelProps) {
  return (
    <aside className="rc-float rc-drawer rc-filters" id="rc-filters" aria-label="خيارات العرض والتصفية">
      <header className="rc-drawer__head">
        <Icon name="sliders" size={16} />
        <h2 className="rc-drawer__title">خيارات التصفية</h2>
        {activeCount > 0 && (
          <span className="rc-count num" title="عدد خيارات التصفية المفعّلة">
            {activeCount}
          </span>
        )}
        <button className="rc-link rc-drawer__reset" type="button" onClick={onReset}>
          إعادة ضبط
        </button>
        <button className="rc-icon-btn" type="button" aria-label="طيّ خيارات التصفية" title="طيّ" onClick={onCollapse}>
          <Icon name="close" size={17} />
        </button>
      </header>

      <div className="rc-drawer__body">
        {onPlans && (
          <button className="rc-btn rc-filters__plans" type="button" onClick={onPlans}>
            <Icon name="swap" size={15} />
            خطط التغذية البديلة
            <Icon name="arrowLeft" size={14} />
          </button>
        )}

        {assumptions}
        {filters}

        <fieldset className="rc-field rc-layers">
          <legend className="rc-field__label">طبقات الخريطة</legend>
          <div className="rc-basemap">
            <label htmlFor="rc-basemap">وضوح خريطة الأساس</label>
            <input
              id="rc-basemap"
              type="range"
              min={0}
              max={BASEMAPS.length - 1}
              step={1}
              value={BASEMAPS.indexOf(basemap)}
              aria-valuetext={BASEMAP_LABEL[basemap]}
              onChange={(e) => onBasemap(BASEMAPS[Number(e.target.value)])}
            />
            <div className="rc-basemap__stops" aria-hidden="true">
              {BASEMAPS.map((stop) => (
                <button key={stop} type="button" tabIndex={-1} className={stop === basemap ? 'is-current' : undefined} onClick={() => onBasemap(stop)}>
                  {BASEMAP_LABEL[stop]}
                </button>
              ))}
            </div>
          </div>
          {importedLayers}
        </fieldset>
      </div>
    </aside>
  )
}
