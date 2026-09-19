import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { normalizeQuery, searchStations, stationNameOf, type StationHit } from '../import/stations'
import { featureCount, type Bbox } from '../import/types'
import { fmt } from '../labels'
import { findDuplicateLayers } from '../layerDuplicates'
import { swatchStyle } from '../layerPalette'
import type { ImportedLayers } from '../useMapLayers'
import { LayerContents } from './LayerContents'
import type { Place } from './mapView'

interface ImportedLayersListProps {
  imported: ImportedLayers
  /** Only admins may delete a layer. */
  canDelete: boolean
  busy: boolean
  onZoom: (bbox: Bbox) => void
  /** Show one station, line or area of a layer on the map. */
  onPoint: (layerId: string, place: Place) => void
  onDelete: (layerId: string) => void
  /** Twin layers of one imported file, to be deleted in one go. */
  onDeleteMany: (layerIds: string[]) => void
  /** The stations of every layer as an Excel file: reads nothing, so anyone may. */
  onExportStations?: () => void
}

// more than this and the number typed is too short to be looking for one station
const MAX_HITS = 30

const placeKey = (layerId: string, place: Place) => `${layerId}|${place.at.join()}|${place.text.n}`
// the index knows a station's name and place; the rest of its popup comes with the layer
const placeOfHit = ({ station }: StationHit): Place => ({ at: station.c, text: { n: stationNameOf(station) }, partial: true })

// "3 طبقات", "11 طبقة": the noun follows the number
const layersPhrase = (count: number) =>
  count === 1 ? 'توجد طبقة مكررة واحدة' : count === 2 ? 'توجد طبقتان مكررتان' : count <= 10 ? `توجد ${fmt(count)} طبقات مكررة` : `توجد ${fmt(count)} طبقة مكررة`

export function ImportedLayersList({ imported, canDelete, busy, onZoom, onPoint, onDelete, onDeleteMany, onExportStations }: ImportedLayersListProps) {
  const { layers, active, loading, failed, contents } = imported
  // the layer whose deletion is waiting for a second, explicit click
  const [confirming, setConfirming] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [current, setCurrent] = useState<string | null>(null)
  const [confirmingTwins, setConfirmingTwins] = useState(false)

  // Twins of one source file, told from what the list already says — nothing is
  // read. Deleting is an admin's: nobody else is shown any of this.
  const twins = useMemo(() => (canDelete ? findDuplicateLayers(layers) : []), [canDelete, layers])
  const doomed = useMemo(() => new Set(twins.flatMap((group) => group.remove.map((layer) => layer.id))), [twins])

  const wanted = normalizeQuery(query)
  const listed = useMemo(
    () => (wanted ? layers.filter((layer) => layer.name.toLowerCase().includes(wanted)) : layers),
    [layers, wanted],
  )
  // from the lists the index carries: typing reads nothing
  const found = useMemo(() => searchStations(layers, wanted, MAX_HITS), [layers, wanted])
  const colors = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.style.color])), [layers])

  // The master checkbox answers for the layers listed right now — the matches of a
  // search, or all of them. A layer with nothing to draw is not one of them.
  const selectable = useMemo(() => listed.filter((layer) => featureCount(layer.counts) > 0).map((layer) => layer.id), [listed])
  const shown = selectable.filter((id) => active.has(id)).length
  const allShown = selectable.length > 0 && shown === selectable.length
  const toggleAll = () => {
    // while they are still arriving, a second click calls off the rest: what has arrived stays
    if (imported.bulk) imported.hideMany(selectable.filter((id) => loading.has(id)))
    else if (allShown) imported.hideMany(selectable)
    else imported.showMany(selectable)
  }

  const point = (layerId: string, place: Place) => {
    setCurrent(placeKey(layerId, place))
    onPoint(layerId, place)
  }

  const expand = (layerId: string) => {
    const open = !expanded.has(layerId)
    setExpanded((now) => new Set(open ? [...now, layerId] : [...now].filter((id) => id !== layerId)))
    // the contents are fetched the first time they are asked for, and kept
    if (open && !contents.has(layerId)) imported.request(layerId)
  }

  return (
    <div className="rc-imported">
      <div className="rc-imported__head">
        <span className="rc-field__label">
          طبقات مستوردة <span className="num">({fmt(layers.length)})</span>
        </span>
        {onExportStations && (
          <button className="rc-link rc-imported__export" type="button" onClick={onExportStations}>
            <Icon name="download" size={13} />
            تصدير المحطات <span lang="en">Excel</span>
          </button>
        )}
      </div>

      {doomed.size > 0 && !imported.removing && (
        <div className="rc-imported__twins" role={confirmingTwins ? 'alert' : undefined}>
          <p>
            <Icon name="alert" size={14} />
            {layersPhrase(doomed.size)}
            {!confirmingTwins && (
              <button className="rc-link" type="button" disabled={busy} onClick={() => setConfirmingTwins(true)}>
                حذف المكرر
              </button>
            )}
          </p>
          {confirmingTwins && (
            <>
              <ul>
                {twins.map((group) => (
                  <li key={group.keep.id}>
                    <span>
                      تبقى <bdi>{group.keep.name}</bdi>
                    </span>
                    {group.remove.map((layer) => (
                      <span key={layer.id} className="rc-imported__doomed">
                        تُحذف <bdi>{layer.name}</bdi>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <p>
                <span>الحذف نهائي، والطبقة الباقية لا تتأثر.</span>
                <button
                  className="rc-link rc-link--danger"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingTwins(false)
                    onDeleteMany([...doomed])
                  }}
                >
                  حذف <span className="num">{fmt(doomed.size)}</span>
                </button>
                <button className="rc-link" type="button" onClick={() => setConfirmingTwins(false)}>
                  تراجع
                </button>
              </p>
            </>
          )}
        </div>
      )}

      {imported.removing && (
        <p className="rc-imported__status" role="status">
          <span className="rc-spinner" aria-hidden="true" />
          جارٍ حذف الطبقات المكررة…{' '}
          <bdi className="num" dir="ltr">{`${fmt(imported.removing.done)} / ${fmt(imported.removing.total)}`}</bdi>
        </p>
      )}

      {imported.indexing && (
        <p className="rc-imported__status" role="status">
          <span className="rc-spinner" aria-hidden="true" />
          جارٍ تجهيز فهرس المحطات…
        </p>
      )}

      <label className="rc-search">
        <span className="rc-search__box">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            placeholder="ابحث برقم المحطة أو اسم الطبقة"
            aria-label="ابحث برقم المحطة أو اسم الطبقة"
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
      </label>

      {found.hits.length > 0 && (
        <div className="rc-imported__hits">
          <span className="rc-imported__caption">
            محطات مطابقة <span className="num">({fmt(found.total)})</span>
          </span>
          <ul>
            {found.hits.map((hit) => {
              const place = placeOfHit(hit)
              const key = placeKey(hit.layerId, place)
              return (
                <li key={key}>
                  <button
                    className="rc-contents__item"
                    type="button"
                    aria-current={key === current || undefined}
                    onClick={() => point(hit.layerId, place)}
                  >
                    <i
                      className="rc-contents__glyph rc-contents__glyph--s"
                      style={swatchStyle(colors.get(hit.layerId) ?? '')}
                      aria-hidden="true"
                    />
                    <bdi className="num">{place.text.n}</bdi>
                    {hit.station.f && (
                      <>
                        <span aria-hidden="true">·</span>
                        <bdi className="num rc-floc" dir="ltr">
                          FLOCSAP {hit.station.f}
                        </bdi>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <bdi className="rc-contents__folder">{hit.layerName}</bdi>
                  </button>
                </li>
              )
            })}
          </ul>
          {found.total > found.hits.length && (
            <p className="rc-imported__caption">
              و<span className="num">{fmt(found.total - found.hits.length)}</span> محطة أخرى — أكمل كتابة الرقم لتضييق النتائج
            </p>
          )}
        </div>
      )}

      {wanted && listed.length === 0 && found.total === 0 && <p className="rc-imported__caption">لا توجد نتائج مطابقة</p>}

      {wanted && listed.length > 0 && found.hits.length > 0 && (
        <span className="rc-imported__caption">
          طبقات مطابقة <span className="num">({fmt(listed.length)})</span>
        </span>
      )}

      {selectable.length > 0 && (
        <label className="rc-check rc-imported__all" title={allShown ? 'إلغاء تحديد الكل' : 'تحديد الكل'}>
          <input
            type="checkbox"
            aria-label={allShown ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            checked={allShown}
            ref={(box) => {
              // some, not all: the dash
              if (box) box.indeterminate = shown > 0 && !allShown
            }}
            onChange={toggleAll}
          />
          <span>
            تحديد الكل <span className="num">({fmt(selectable.length)})</span>
          </span>
        </label>
      )}

      {imported.bulk && (
        <p className="rc-imported__status" role="status">
          <span className="rc-spinner" aria-hidden="true" />
          جارٍ تحميل الطبقات…{' '}
          <bdi className="num" dir="ltr">{`${fmt(imported.bulk.done)} / ${fmt(imported.bulk.total)}`}</bdi>
          <button className="rc-link" type="button" onClick={toggleAll}>
            إيقاف
          </button>
        </p>
      )}

      <ul className="rc-imported__list">
        {listed.map((layer) => {
          const open = expanded.has(layer.id)
          const stations = layer.stations?.length ?? 0
          return confirming === layer.id ? (
            <li key={layer.id} className="rc-imported__confirm" role="alert">
              <span>
                حذف «<bdi>{layer.name}</bdi>» نهائياً؟
              </span>
              <button
                className="rc-link rc-link--danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirming(null)
                  onDelete(layer.id)
                }}
              >
                حذف
              </button>
              <button className="rc-link" type="button" onClick={() => setConfirming(null)}>
                تراجع
              </button>
            </li>
          ) : (
            <li key={layer.id} className={`rc-imported__layer${open ? ' is-open' : ''}`}>
              <div className="rc-imported__row">
                <button
                  className="rc-imported__expand"
                  type="button"
                  aria-expanded={open}
                  aria-label={`محتويات «${layer.name}»`}
                  title={open ? 'إخفاء المحتويات' : 'عرض المحتويات'}
                  onClick={() => expand(layer.id)}
                >
                  <Icon name="chevronDown" size={14} />
                </button>
                <label className="rc-check" title={layer.name}>
                  <input
                    type="checkbox"
                    checked={active.has(layer.id)}
                    onChange={(e) => imported.toggle(layer.id, e.target.checked)}
                  />
                  <i className="rc-imported__swatch" style={swatchStyle(layer.style.color)} aria-hidden="true" />
                  <bdi>{layer.name}</bdi>
                </label>
                <button
                  className="rc-icon-btn rc-icon-btn--small"
                  type="button"
                  aria-label={`عرض «${layer.name}» على الخريطة`}
                  title="الانتقال إلى الطبقة"
                  onClick={() => {
                    // moving to a layer that is not shown would land on an empty map
                    if (!active.has(layer.id)) imported.toggle(layer.id, true)
                    onZoom(layer.bbox)
                  }}
                >
                  <Icon name="crosshair" size={14} />
                </button>
                {canDelete && (
                  <button
                    className="rc-icon-btn rc-icon-btn--small"
                    type="button"
                    aria-label={`حذف «${layer.name}»`}
                    title="حذف الطبقة"
                    disabled={busy}
                    onClick={() => setConfirming(layer.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
              <div className="rc-imported__meta">
                {/* many at once are told in one line above, not a hundred spinners */}
                {loading.has(layer.id) && active.has(layer.id) && !imported.bulk ? (
                  <>
                    <span className="rc-spinner" role="status" aria-label="جارٍ تحميل الطبقة" />
                    جارٍ التحميل…
                  </>
                ) : failed.has(layer.id) ? (
                  <span className="rc-imported__failed">تعذّر التحميل</span>
                ) : (
                  <span className="rc-imported__count">
                    العناصر <span className="num">{fmt(featureCount(layer.counts))}</span>
                  </span>
                )}
                {stations > 0 && (
                  <span className="rc-imported__chip">
                    <span className="num">{fmt(stations)}</span> محطة
                  </span>
                )}
                {doomed.has(layer.id) && <span className="rc-imported__chip rc-imported__chip--twin">مكررة</span>}
              </div>
              {open && (
                <LayerContents
                  features={contents.get(layer.id)}
                  color={layer.style.color}
                  failed={failed.has(layer.id)}
                  current={current}
                  keyOf={(place) => placeKey(layer.id, place)}
                  onPoint={(place) => point(layer.id, place)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
