import { Icon } from '../../../components/Icon'

interface FiltersButtonProps {
  className: string
  /** Filters that narrow the stations right now. */
  count: number
  onClick: () => void
}

/** Opens the filters: it floats on the map of a wide screen and sits under the map of a phone. */
export function FiltersButton({ className, count, onClick }: FiltersButtonProps) {
  return (
    <button className={className} type="button" aria-expanded={false} aria-controls="rc-filters" onClick={onClick}>
      <Icon name="sliders" size={16} />
      <span>خيارات التصفية</span>
      {count > 0 && (
        <span className="rc-count num" title="عدد خيارات التصفية المفعّلة">
          {count}
        </span>
      )}
    </button>
  )
}
