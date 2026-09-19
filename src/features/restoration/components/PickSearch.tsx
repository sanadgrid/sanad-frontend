import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { locate, type StationDirectory, type StationPoint } from '../backup/directory'
import type { LatLng } from '../types'
import { StationNoField } from './StationNoField'

interface PickSearchProps {
  directory: StationDirectory
  /** The same as a click on the station's square. */
  onPick: (point: StationPoint) => void
  /** Brings a place into view and rings it. */
  onShow: (at: LatLng | null) => void
}

/** Among hundreds of squares, the number is the quick way to a station: typed here, it is chosen as if it had been clicked. */
export function PickSearch({ directory, onPick, onShow }: PickSearchProps) {
  const [typed, setTyped] = useState('')
  const found = typed.trim() ? locate(directory, typed) : null
  const several = (found?.points.length ?? 0) > 1

  const choose = () => {
    if (!found) return
    onShow(found.points[0].at)
    if (several) return
    onPick(found.points[0])
    setTyped('')
    // the ring has said where the station is: it need not stay
    setTimeout(() => onShow(null), 1600)
  }

  return (
    <form
      className="rc-picksearch"
      onSubmit={(e) => {
        e.preventDefault()
        choose()
      }}
    >
      <StationNoField
        label="ابحث برقم المحطة"
        placeholder="أو اكتب رقم المحطة"
        value={typed}
        directory={directory}
        onChange={(value) => {
          setTyped(value)
          onShow(null)
        }}
      />
      <button className="rc-btn" type="submit" disabled={!found}>
        <Icon name={several ? 'search' : 'plus'} size={14} />
        {several ? 'عرض' : 'اختيار'}
      </button>
      {several && <p>لهذا الرقم أكثر من موقع — اضغط الموقع الصحيح على الخريطة.</p>}
    </form>
  )
}
