import type { ReactNode } from 'react'
import { Icon } from '../../../components/Icon'
import type { Bounds, Filters, Layers, Range } from '../filters'
import { FORECAST_LABEL, MONTHS_AR } from '../labels'
import type { Conditions, Period, Sector } from '../types'
import { RangeSlider } from './RangeSlider'

interface FilterPanelProps {
  sector: Sector
  /** Departments that actually have stations; the rest are shown disabled. */
  activeDepartments: Set<string>
  conditions: Conditions
  filters: Filters
  layers: Layers
  bounds: Bounds
  onConditions: (patch: Partial<Conditions>) => void
  onFilters: (patch: Partial<Filters>) => void
  onLayers: (patch: Partial<Layers>) => void
  onReset: () => void
}

interface PillsProps<T> {
  label: string
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
  segmented?: boolean
}

function Pills<T extends string | number | null>({ label, options, value, onChange, segmented }: PillsProps<T>) {
  return (
    <div className={segmented ? 'rc-segment' : 'rc-pills'} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="rc-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
      <span>{label}</span>
    </label>
  )
}

const latin = (text: string) => (
  <span dir="ltr" className="num">
    {text}
  </span>
)

const toPeriod = (value: string): Period => (value === 'forecast' ? 'forecast' : Number(value))
/** A slider dragged back to its full extent means "no filter". */
const toRange = (value: Range, bounds: Range): Range | null =>
  value[0] <= bounds[0] && value[1] >= bounds[1] ? null : value

export function FilterPanel({
  sector,
  activeDepartments,
  conditions,
  filters,
  layers,
  bounds,
  onConditions,
  onFilters,
  onLayers,
  onReset,
}: FilterPanelProps) {
  const departments = sector.areas.find((a) => a.id === filters.areaId)?.departments ?? []

  return (
    <aside className="rc-panel rc-filters" aria-label="خيارات العرض والتصفية">
      <div className="rc-field">
        <label className="rc-select">
          <span>الفترة</span>
          <select value={String(conditions.period)} onChange={(e) => onConditions({ period: toPeriod(e.target.value) })}>
            {MONTHS_AR.map((month, i) => (
              <option key={month} value={i}>
                {month}
              </option>
            ))}
            <option value="forecast">{FORECAST_LABEL}</option>
          </select>
        </label>
      </div>

      <div className="rc-field">
        <span className="rc-field__label">السيناريو</span>
        <Pills
          segmented
          label="السيناريو"
          value={conditions.scenario}
          onChange={(scenario) => onConditions({ scenario })}
          options={[
            { value: 'normal', label: 'الحالة العادية' },
            { value: 'peak', label: 'الحمل الذروي' },
          ]}
        />
      </div>

      <div className="rc-field">
        <span className="rc-field__label">منطقة التشغيل</span>
        <Pills
          label="منطقة التشغيل"
          value={filters.areaId}
          onChange={(areaId) => onFilters({ areaId, department: null })}
          options={[
            { value: null, label: 'الكل' },
            ...sector.areas.map((a) => ({ value: a.id, label: <span title={a.nameAr}>{latin(a.id)}</span> })),
          ]}
        />
        {departments.length > 0 && (
          <Pills
            label="الإدارة"
            value={filters.department}
            onChange={(department) => onFilters({ department })}
            options={[
              { value: null, label: 'كل الإدارات' },
              ...departments.map((d) => ({ value: d, label: d, disabled: !activeDepartments.has(d) })),
            ]}
          />
        )}
      </div>

      <div className="rc-field rc-field--split">
        <div>
          <span className="rc-field__label">نوع المحطة</span>
          <Pills
            segmented
            label="نوع المحطة"
            value={filters.type}
            onChange={(type) => onFilters({ type })}
            options={[
              { value: null, label: 'الكل' },
              { value: 'NG', label: latin('NG') },
              { value: 'MDN', label: latin('MDN') },
            ]}
          />
        </div>
        <div>
          <span className="rc-field__label">
            الجهد {latin('kV')}
          </span>
          <Pills
            segmented
            label="الجهد"
            value={filters.voltageKv}
            onChange={(voltageKv) => onFilters({ voltageKv })}
            options={[
              { value: null, label: 'الكل' },
              { value: 33, label: latin('33') },
              { value: 13.8, label: latin('13.8') },
            ]}
          />
        </div>
      </div>

      <RangeSlider
        label="حمل المحطة"
        unit="MVA"
        bounds={bounds.loadMva}
        value={filters.loadMva ?? bounds.loadMva}
        step={5}
        onChange={(value) => onFilters({ loadMva: toRange(value, bounds.loadMva) })}
      />
      <RangeSlider
        label="عدد المشتركين (بالآلاف)"
        unit="K"
        bounds={bounds.customersK}
        value={filters.customersK ?? bounds.customersK}
        onChange={(value) => onFilters({ customersK: toRange(value, bounds.customersK) })}
      />

      <label className="rc-search">
        <span className="rc-field__label">بحث</span>
        <span className="rc-search__box">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={filters.search}
            placeholder="رمز المحطة أو الحي"
            onChange={(e) => onFilters({ search: e.target.value })}
          />
        </span>
      </label>

      <div className="rc-field">
        <Toggle
          label="المحطات التي لا تحقق N-1"
          checked={filters.failingN1}
          onChange={(failingN1) => onFilters({ failingN1 })}
        />
        <Toggle
          label="مصدر تغذية مؤقت متاح"
          checked={filters.temporarySupply}
          onChange={(temporarySupply) => onFilters({ temporarySupply })}
        />
      </div>

      <fieldset className="rc-field rc-layers">
        <legend className="rc-field__label">طبقات الخريطة</legend>
        <Toggle label="المشتركون الحساسون" checked={layers.sensitive} onChange={(sensitive) => onLayers({ sensitive })} />
        <Toggle label="كبار المشتركين (VIP)" checked={layers.vip} onChange={(vip) => onLayers({ vip })} />
        <Toggle label="خطوط الربط" checked={layers.ties} onChange={(ties) => onLayers({ ties })} />
      </fieldset>

      <button className="rc-btn rc-btn--block" type="button" onClick={onReset}>
        إعادة ضبط
      </button>
    </aside>
  )
}
