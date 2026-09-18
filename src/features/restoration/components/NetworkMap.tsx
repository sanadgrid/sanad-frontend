import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Status } from '../engine'
import type { Layers } from '../filters'
import { CONSTRUCTION_LABEL, fmt, STATUS, SWITCHING_LABEL } from '../labels'
import { themeColors, type MapColors } from '../mapTheme'
import { mapTiles } from '../mapTiles'
import type { Construction, LatLng, Switching } from '../types'
import type { Theme } from '../useTheme'

export interface MapStation {
  id: string
  code: string
  district: string
  location: LatLng
  status: Status
  capacityPct: number
  loadMva: number
  sensitive: boolean
  vip: boolean
}

export interface MapTie {
  id: string
  from: MapStation
  to: MapStation
  fromFeederCode: string
  toFeederCode: string
  construction: Construction
  circuits: 1 | 2
  capacityMva: number
  switching: Switching
}

interface NetworkMapProps {
  center: LatLng
  zoom: number
  stations: MapStation[]
  ties: MapTie[]
  layers: Layers
  selectedId: string | null
  theme: Theme
  onSelect: (stationId: string) => void
}

const OVERHEAD_DASH = '7 7'
// parallel ties between the same two stations are fanned out by this many degrees
const FAN_STEP = 0.0024

const isWeak = (s: MapStation) => s.status === 'limited' || s.status === 'none'
/** Bigger load → bigger marker, on a square-root scale so 120 MVA does not dwarf 15 MVA. */
const radiusOf = (loadMva: number) => 6 + Math.sqrt(Math.max(0, loadMva)) * 0.9

// tooltips are HTML strings, and the texts come from the database
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Latin runs are isolated so "33 kV" or "NG-101" keep their order inside RTL text
const ltr = (text: string) => `<bdi dir="ltr" class="num">${escapeHtml(text)}</bdi>`

function stationTooltip(s: MapStation): string {
  return `<div dir="rtl"><b>${ltr(s.code)}</b> · ${escapeHtml(s.district)}<br>قدرة الاستعادة ${ltr(`${s.capacityPct}%`)} · ${ltr(`${fmt(s.loadMva, 1)} MVA`)}</div>`
}

function tieTooltip(t: MapTie): string {
  const ends = `${ltr(`${t.from.code}/${t.fromFeederCode}`)} ↔ ${ltr(`${t.to.code}/${t.toFeederCode}`)}`
  const kind = `${CONSTRUCTION_LABEL[t.construction]}${t.circuits === 2 ? ' · دائرتان' : ''} · ${SWITCHING_LABEL[t.switching]}`
  return `<div dir="rtl">${ends}<br>${kind} · ${ltr(`${fmt(t.capacityMva)} MVA`)}</div>`
}

/** Shift the i-th of n parallel ties sideways, perpendicular to the line. */
function fan(from: LatLng, to: LatLng, i: number, n: number): [number, number][] {
  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng
  const length = Math.hypot(dLat, dLng) || 1
  const offset = (i - (n - 1) / 2) * FAN_STEP
  const oLat = (-dLng / length) * offset
  const oLng = (dLat / length) * offset
  return [
    [from.lat + oLat, from.lng + oLng],
    [to.lat + oLat, to.lng + oLng],
  ]
}

export function NetworkMap({ center, zoom, stations, ties, layers, selectedId, theme, onSelect }: NetworkMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const overlay = useRef<L.LayerGroup | null>(null)
  // the latest callback without redrawing every marker when its identity changes
  const select = useRef(onSelect)
  useEffect(() => {
    select.current = onSelect
  }, [onSelect])

  // Every colour goes through a painter, so a change of theme restyles the
  // layers that exist: no redraw, and the map keeps its view and its tiles.
  const colors = useRef(themeColors(theme))
  const painters = useRef<((c: MapColors) => void)[]>([])
  useEffect(() => {
    colors.current = themeColors(theme)
    for (const paint of painters.current) paint(colors.current)
  }, [theme])

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { zoomControl: false, minZoom: 8, maxZoom: 16 })
    L.tileLayer(mapTiles.url, {
      attribution: mapTiles.attribution,
      subdomains: 'abcd',
      maxNativeZoom: mapTiles.maxNativeZoom,
      className: mapTiles.themed ? 'rc-map__tiles--themed' : undefined,
    }).addTo(instance)
    L.control.zoom({ position: 'topleft', zoomInTitle: 'تكبير', zoomOutTitle: 'تصغير' }).addTo(instance)
    map.current = instance
    overlay.current = L.layerGroup().addTo(instance)

    // the grid can resize the container after Leaflet has measured it
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)

    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      overlay.current = null
    }
  }, [])

  useEffect(() => {
    map.current?.setView([center.lat, center.lng], zoom)
  }, [center.lat, center.lng, zoom])

  useEffect(() => {
    const group = overlay.current
    if (!group) return
    group.clearLayers()
    painters.current = []

    const themed = <T extends L.Path>(layer: T, style: (c: MapColors) => L.PathOptions): T => {
      const paint = (c: MapColors) => layer.setStyle(style(c))
      paint(colors.current)
      painters.current.push(paint)
      return layer.addTo(group)
    }

    if (layers.ties) {
      const parallel = new Map<string, MapTie[]>()
      for (const tie of ties) {
        const key = [tie.from.id, tie.to.id].sort().join('|')
        parallel.set(key, [...(parallel.get(key) ?? []), tie])
      }
      for (const bundle of parallel.values()) {
        bundle.forEach((tie, i) => {
          // keep one orientation per bundle so the fan does not fold onto itself
          const [a, b] = tie.from.id < tie.to.id ? [tie.from, tie.to] : [tie.to, tie.from]
          const path = fan(a.location, b.location, i, bundle.length)
          const weak = isWeak(tie.from) || isWeak(tie.to)
          const overhead = tie.construction === 'overhead'
          const dashArray = overhead ? OVERHEAD_DASH : undefined
          const line = themed(
            L.polyline(path, { dashArray, weight: tie.circuits === 2 ? 5.5 : 1.8, lineCap: 'butt' }),
            (c) => ({ color: weak ? c.tieWeak : overhead ? c.tieOverhead : c.tieUnderground, opacity: c.tieOpacity }),
          )
          // double circuit = two parallel strokes: a core in the basemap's tone splits the wide line
          if (tie.circuits === 2)
            themed(L.polyline(path, { dashArray, weight: 1.8, lineCap: 'butt', interactive: false }), (c) => ({
              color: c.tieCore,
            }))
          line.bindTooltip(tieTooltip(tie), { sticky: true, className: 'rc-tooltip' })
        })
      }
    }

    for (const s of stations) {
      const at: [number, number] = [s.location.lat, s.location.lng]
      const radius = radiusOf(s.loadMva)
      const ring = (extra: number, color: (c: MapColors) => string, dashArray?: string) =>
        themed(
          L.circleMarker(at, { radius: radius + extra, weight: 2, dashArray, fill: false, interactive: false }),
          (c) => ({ color: color(c) }),
        )

      if (layers.sensitive && s.sensitive) ring(4, (c) => c.sensitive)
      if (layers.vip && s.vip) ring(layers.sensitive && s.sensitive ? 8 : 4, (c) => c.vip, '3 4')
      if (s.id === selectedId) ring(12, (c) => c.selection)

      themed(
        L.circleMarker(at, {
          radius,
          fillColor: STATUS[s.status].color,
          fillOpacity: 0.95,
          bubblingMouseEvents: false,
          // the stylesheet hangs the light theme's drop shadow on this
          className: 'rc-map__station',
        }),
        (c) => ({ color: c.markerStroke, weight: c.markerStrokeWeight }),
      )
        .bindTooltip(stationTooltip(s), { direction: 'top', offset: [0, -radius], className: 'rc-tooltip' })
        .on('click', () => select.current(s.id))
    }
  }, [stations, ties, layers, selectedId])

  return <div className="rc-map__canvas" ref={container} dir="ltr" role="application" aria-label="خريطة محطات القطاع" />
}
