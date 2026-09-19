import { useState } from 'react'
import { distanceKm, type StationPoint } from '../backup/directory'
import type { Position } from '../import/types'
import { fmt } from '../labels'
import type { LatLng } from '../types'

interface PlaceChooserProps {
  /** What the places are of, for a screen reader: "رقم البديل 2". */
  label: string
  places: StationPoint[]
  /** The place the line holds, if one was chosen. */
  at?: Position
  /** Where the distances are measured from, and what that is called. */
  near?: { at: LatLng; label: string }
  onChoose: (place: StationPoint) => void
  /** The option under the pointer or the focus: the map points it out. */
  onHover: (at: LatLng | null) => void
}

// metres to the nearest ten under a kilometre: enough to tell neighbours apart
const distanceOf = (km: number) => (km < 1 ? { value: fmt(Math.round(km * 100) * 10), unit: 'م' } : { value: fmt(km, 1), unit: 'كم' })

const placesLabel = (count: number) => (count === 2 ? 'يوجد موقعان بهذا الرقم' : `يوجد ${fmt(count)} مواقع بهذا الرقم`)

/** One number at several places of the map: which of them the plan means. Choosing reads nothing. */
export function PlaceChooser({ label, places, at, near, onChoose, onHover }: PlaceChooserProps) {
  const held = places.findIndex((place) => at?.[0] === place.at.lng && at?.[1] === place.at.lat)
  // once a place is held the question is answered: one line says which, and opens the list again
  const [open, setOpen] = useState(held < 0)

  const describe = (place: StationPoint, index: number) => {
    const distance = near ? distanceOf(distanceKm(near.at, place.at)) : null
    return (
      <>
        <i className="num" aria-hidden="true">
          {index + 1}
        </i>
        <bdi>{place.layerName || 'طبقة مستوردة'}</bdi>
        {place.name !== `S/S ${place.no}` && <bdi className="rc-places__name">{place.name}</bdi>}
        {distance && near && (
          <small>
            <span className="num">{distance.value}</span> {distance.unit} من {near.label}
          </small>
        )}
      </>
    )
  }

  if (!open && held >= 0)
    return (
      <div className="rc-places rc-places--held">
        <button
          type="button"
          aria-label={`تغيير موقع ${label}`}
          title="تغيير الموقع"
          onMouseEnter={() => onHover(places[held].at)}
          onMouseLeave={() => onHover(null)}
          onClick={() => setOpen(true)}
        >
          {describe(places[held], held)}
          <span className="rc-places__change">
            من <span className="num">{fmt(places.length)}</span> · تغيير
          </span>
        </button>
      </div>
    )

  return (
    <div className="rc-places" role="radiogroup" aria-label={`مواقع ${label}`} onMouseLeave={() => onHover(null)}>
      <p className="rc-places__count">
        {placesLabel(places.length)}
        {held < 0 && ' — اختر الموقع المقصود'}
      </p>
      {places.map((place, i) => (
        <button
          key={`${place.at.lat},${place.at.lng}`}
          type="button"
          role="radio"
          aria-checked={i === held}
          onMouseEnter={() => onHover(place.at)}
          onFocus={() => onHover(place.at)}
          onBlur={() => onHover(null)}
          onClick={() => {
            onChoose(place)
            onHover(null)
            setOpen(false)
          }}
        >
          {describe(place, i)}
        </button>
      ))}
    </div>
  )
}
