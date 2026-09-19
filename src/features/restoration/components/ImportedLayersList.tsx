import { useMemo, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { normalizeQuery, searchStations, stationNameOf, type StationHit } from '../import/stations'
import { featureCount, type Bbox } from '../import/types'
import { fmt } from '../labels'
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
}

// more than this and the number typed is too short to be looking for one station
const MAX_HITS = 30

const placeKey = (layerId: string, place: Place) => `${layerId}|${place.at.join()}|${place.text.n}`
// the index knows a station's name and place; the rest of its popup comes with the layer
const placeOfHit = ({ station }: StationHit): Place => ({ at: station.c, text: { n: stationNameOf(station) }, partial: true })

export function ImportedLayersList({ imported, canDelete, busy, onZoom, onPoint, onDelete }: ImportedLayersListProps) {
  const { layers, active, loading, failed, contents } = imported
  // the layer whose deletion is waiting for a second, explicit click
  const [confirming, setConfirming] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [current, setCurrent] = useState<string | null>(null)

  const wanted = normalizeQuery(query)
  const listed = useMemo(
    () => (wanted ? layers.filter((layer) => layer.name.toLowerCase().includes(wanted)) : layers),
    [layers, wanted],
  )
  // from the lists the index carries: typing reads nothing
  const found = useMemo(() => searchStations(layers, wanted, MAX_HITS), [layers, wanted])
  const colors = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.style.color])), [layers])

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
        {active.size > 0 && (
          <button className="rc-link" type="button" onClick={imported.hideAll}>
            إخفاء الكل
          </button>
        )}
      </div>

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
                {loading.has(layer.id) && active.has(layer.id) ? (
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
