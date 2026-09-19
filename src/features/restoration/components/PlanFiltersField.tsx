import { Icon } from '../../../components/Icon'
import type { PlanFilters } from '../backup/planFilters'
import { STATUS, STATUS_ORDER } from '../labels'
import { Pills } from './Pills'
import { Toggle } from './Toggle'

interface PlanFiltersFieldProps {
  filters: PlanFilters
  /** The voltages the sector's plans are written for. */
  voltages: number[]
  onFilters: (patch: Partial<PlanFilters>) => void
}

const latin = (text: string) => (
  <span dir="ltr" className="num">
    {text}
  </span>
)

/** What narrows the plans: the strip, the table, the file and the map all follow. */
export function PlanFiltersField({ filters, voltages, onFilters }: PlanFiltersFieldProps) {
  return (
    <>
      <label className="rc-search">
        <span className="rc-field__label">بحث برقم المحطة أو المغذي</span>
        <span className="rc-search__box">
          <Icon name="search" size={16} />
          <input type="search" inputMode="numeric" value={filters.search} placeholder="رئيسي أو بديل" onChange={(e) => onFilters({ search: e.target.value })} />
        </span>
      </label>

      <div className="rc-field">
        <span className="rc-field__label">التصنيف</span>
        <Pills
          label="التصنيف"
          value={filters.status}
          onChange={(status) => onFilters({ status })}
          options={[{ value: null, label: 'الكل' }, ...STATUS_ORDER.map((status) => ({ value: status, label: STATUS[status].label }))]}
        />
      </div>

      <div className="rc-field rc-field--split">
        <div>
          <span className="rc-field__label">المستوى</span>
          <Pills
            segmented
            label="المستوى"
            value={filters.level}
            onChange={(level) => onFilters({ level })}
            options={[
              { value: null, label: 'الكل' },
              { value: 'station', label: 'محطة' },
              { value: 'feeder', label: 'مغذي' },
            ]}
          />
        </div>
        <div>
          <span className="rc-field__label">الجهد {latin('kV')}</span>
          <Pills
            segmented
            label="الجهد"
            value={filters.voltageKv}
            onChange={(voltageKv) => onFilters({ voltageKv })}
            options={[{ value: null, label: 'الكل' }, ...voltages.map((kv) => ({ value: kv, label: latin(String(kv)) }))]}
          />
        </div>
      </div>

      <div className="rc-field">
        <Toggle
          label={
            <>
              أقل من <span dir="ltr">100%</span> فقط
            </>
          }
          checked={filters.below100}
          onChange={(below100) => onFilters({ below100 })}
        />
        <Toggle label="بديل يتجاوز سعته" checked={filters.overRated} onChange={(overRated) => onFilters({ overRated })} />
      </div>

      <div className="rc-field">
        <span className="rc-field__label">الخطط التجريبية</span>
        <Pills
          segmented
          label="الخطط التجريبية"
          value={filters.demo}
          onChange={(demo) => onFilters({ demo })}
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'only', label: 'تجريبي فقط' },
            { value: 'without', label: 'بدون التجريبي' },
          ]}
        />
      </div>
    </>
  )
}
