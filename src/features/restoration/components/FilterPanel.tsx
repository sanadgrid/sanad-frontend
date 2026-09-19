import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { Layers } from '../filters'
import { BASEMAPS, type Basemap } from '../useBasemap'
import { NetworkFilters, NetworkLayerToggles, type NetworkFiltersProps } from './NetworkFilters'
import { Toggle } from './Toggle'

interface FilterPanelProps extends NetworkFiltersProps {
  layers: Layers
  /** Filters that narrow the stations right now. */
  activeCount: number
  /** The sector's imported layers, when the user may see any. */
  importedLayers?: ReactNode
  basemap: Basemap
  onBasemap: (basemap: Basemap) => void
  /** Whether the network's stations are on the map: without them, what filters them steps back. */
  networkShown: boolean
  /** Whether the synthetic training network is drawn; `undefined` for a real network, which is never asked. */
  demoNetwork?: boolean
  onDemoNetwork: (shown: boolean) => void
  /** Opens the backup plans; present for a signed-in user only. */
  onPlans?: () => void
  onLayers: (patch: Partial<Layers>) => void
  onReset: () => void
  onCollapse: () => void
}

const BASEMAP_LABEL: Record<Basemap, string> = { faint: 'باهت', medium: 'متوسط', clear: 'واضح' }

export function FilterPanel(props: FilterPanelProps) {
  const { layers, activeCount, importedLayers, basemap, onBasemap, networkShown, demoNetwork, onPlans, onLayers } = props
  const filters = <NetworkFilters {...props} />

  return (
    <aside className="rc-float rc-drawer rc-filters" id="rc-filters" aria-label="خيارات العرض والتصفية">
      <header className="rc-drawer__head">
        <Icon name="sliders" size={16} />
        <h2 className="rc-drawer__title">خيارات التصفية</h2>
        {activeCount > 0 && networkShown && (
          <span className="rc-count num" title="عدد خيارات التصفية المفعّلة">
            {activeCount}
          </span>
        )}
        <button className="rc-link rc-drawer__reset" type="button" onClick={props.onReset}>
          إعادة ضبط
        </button>
        <button className="rc-icon-btn" type="button" aria-label="طيّ خيارات التصفية" title="طيّ" onClick={props.onCollapse}>
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

        {networkShown && filters}

        <fieldset className="rc-field rc-layers">
          <legend className="rc-field__label">طبقات الخريطة</legend>
          {networkShown && <NetworkLayerToggles layers={layers} onLayers={onLayers} />}
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
          {demoNetwork !== undefined && (
            <div className="rc-layers__demo">
              <Toggle label="الشبكة التجريبية" checked={demoNetwork} onChange={props.onDemoNetwork} />
              <small>شبكة مصطنعة للتدريب — ليست بيانات فعلية.</small>
            </div>
          )}
        </fieldset>

        {/* nothing of the network is on the map: what only it answers to waits folded, never gone */}
        {!networkShown && (
          <details className="rc-disclose">
            <summary>
              <Icon name="chevronDown" size={15} />
              خيارات الشبكة التجريبية
            </summary>
            <div className="rc-disclose__body">
              {filters}
              <div className="rc-field">
                <NetworkLayerToggles layers={layers} onLayers={onLayers} />
              </div>
            </div>
          </details>
        )}
      </div>
    </aside>
  )
}
