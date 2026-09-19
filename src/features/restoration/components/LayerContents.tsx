import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { layerContents, type ContentGroup, type ContentItem } from '../import/contents'
import type { CompactFeature } from '../import/types'
import { fmt } from '../labels'
import { swatchStyle } from '../layerPalette'
import type { Place } from './mapView'

interface LayerContentsProps {
  /** `undefined` while the layer is on its way. */
  features: CompactFeature[] | undefined
  failed: boolean
  /** The layer's stored colour: its stations are marked with it, as on the map. */
  color: string
  /** The key of the item the map was last pointed at. */
  current: string | null
  keyOf: (place: Place) => string
  onPoint: (place: Place) => void
}

// a drawing can hold thousands of rows: they are listed a screenful at a time
const PAGE = 200
const UNNAMED = 'بدون اسم'

const placeOf = ({ at, bbox, n, g, d }: ContentItem): Place => ({ at, bbox, text: { n, g, d } })

function titleOf(group: ContentGroup, hasStations: boolean): string {
  if (group.kind === 'stations') return 'المحطات'
  if (group.kind === 'folder') return group.folder ?? ''
  if (group.kind === 'points') return hasStations ? 'نقاط أخرى' : 'نقاط'
  return group.kind === 'lines' ? 'خطوط' : 'مناطق'
}

interface GroupProps extends Pick<LayerContentsProps, 'current' | 'keyOf' | 'onPoint'> {
  group: ContentGroup
  title: string
  startsOpen: boolean
}

function Group({ group, title, startsOpen, current, keyOf, onPoint }: GroupProps) {
  const [open, setOpen] = useState(startsOpen)
  const [limit, setLimit] = useState(PAGE)
  const { items } = group

  return (
    <section className={`rc-contents__group${open ? ' is-open' : ''}`}>
      <button className="rc-contents__head" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chevronDown" size={12} />
        <bdi>{title}</bdi>
        <span className="num">({fmt(items.length)})</span>
      </button>
      {open && (
        <ul>
          {items.slice(0, limit).map((item) => {
            const place = placeOf(item)
            return (
              <li key={item.key}>
                <button
                  className="rc-contents__item"
                  type="button"
                  aria-current={keyOf(place) === current || undefined}
                  onClick={() => onPoint(place)}
                >
                  <i className={`rc-contents__glyph rc-contents__glyph--${item.no ? 's' : item.t}`} aria-hidden="true" />
                  <bdi className={item.no ? 'num' : undefined}>{item.n || UNNAMED}</bdi>
                  {/* inside a folder's own group the folder has already been said */}
                  {item.g && group.kind !== 'folder' && <bdi className="rc-contents__folder">{item.g}</bdi>}
                </button>
              </li>
            )
          })}
          {items.length > limit && (
            <li>
              <button className="rc-link" type="button" onClick={() => setLimit(limit + PAGE)}>
                عرض المزيد <span className="num">({fmt(items.length - limit)})</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

/** What a layer holds, grouped: stations first, then its sub-folders, then the rest by kind. */
export function LayerContents({ features, failed, color, current, keyOf, onPoint }: LayerContentsProps) {
  const groups = useMemo(() => (features ? layerContents(features) : []), [features])

  if (failed) return <p className="rc-contents__note rc-contents__note--failed">تعذّر تحميل محتويات الطبقة</p>
  if (!features)
    return (
      <p className="rc-contents__note" role="status">
        <span className="rc-spinner" aria-hidden="true" />
        جارٍ تحميل المحتويات…
      </p>
    )
  if (groups.length === 0) return <p className="rc-contents__note">لا توجد عناصر في هذه الطبقة</p>

  const hasStations = groups[0].kind === 'stations'
  return (
    <div className="rc-contents" style={swatchStyle(color)}>
      {groups.map((group, i) => (
        <Group
          key={`${group.kind}:${group.folder ?? ''}`}
          group={group}
          title={titleOf(group, hasStations)}
          // the stations are what people open a layer for; without any, the first group stands in
          startsOpen={i === 0}
          current={current}
          keyOf={keyOf}
          onPoint={onPoint}
        />
      ))}
    </div>
  )
}
