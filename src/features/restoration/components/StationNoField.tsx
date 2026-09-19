import { useId, useState } from 'react'
import { locate, suggest, type StationDirectory } from '../backup/directory'

interface StationNoFieldProps {
  label: string
  value: string
  directory: StationDirectory
  onChange: (value: string) => void
}

const MAX_SUGGESTIONS = 6

/** A station number, completed from the stations of the imported layers — what is typed reads nothing. */
export function StationNoField({ label, value, directory, onChange }: StationNoFieldProps) {
  const [focused, setFocused] = useState(false)
  const listId = useId()
  const found = value.trim() ? locate(directory, value) : null
  const options = focused ? suggest(directory, value, MAX_SUGGESTIONS).filter((s) => s.no !== value.trim()) : []

  return (
    <div className="rc-stationno">
      <input
        className="num"
        dir="ltr"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        role="combobox"
        aria-label={label}
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-invalid={Boolean(value.trim()) && !found}
        placeholder="الرقم"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // after the click on a suggestion has landed
        onBlur={() => setTimeout(() => setFocused(false), 120)}
      />
      {options.length > 0 && (
        <ul className="rc-stationno__options" id={listId} role="listbox">
          {options.map((station) => (
            <li key={station.no} role="option" aria-selected="false">
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(station.no)}>
                <b className="num">{station.no}</b>
                {station.name !== `S/S ${station.no}` && <bdi>{station.name}</bdi>}
                {station.points.length > 1 && <small dir="rtl">{station.points.length} مواقع</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Said under a number the imported layers do not know. */
export const NOT_ON_MAP = 'غير موجودة في الطبقات المستوردة — لن تُرسم على الخريطة'
