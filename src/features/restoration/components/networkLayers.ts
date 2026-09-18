import L from 'leaflet'
import type { Status } from '../engine'
import type { Layers } from '../filters'
import { CONSTRUCTION_LABEL, fmt, STATUS, SWITCHING_LABEL } from '../labels'
import type { MapColors } from '../mapTheme'
import type { Construction, LatLng, Switching } from '../types'

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

/** Station names sit above the network's SVG (400) and under Leaflet's tooltips (650). */
export const LABEL_PANE = 'rc-labels'
export const LABEL_PANE_Z = 450

/** Adds a layer whose colours follow the theme. */
export type Themed = <T extends L.Path>(layer: T, style: (c: MapColors) => L.PathOptions) => T

interface NetworkDrawing {
  group: L.LayerGroup
  themed: Themed
  stations: MapStation[]
  ties: MapTie[]
  layers: Layers
  selectedId: string | null
  onSelect: (stationId: string) => void
}

const OVERHEAD_DASH = '7 7'
// parallel ties between the same two stations are fanned out by this many degrees
const FAN_STEP = 0.0024

const isWeak = (s: MapStation) => s.status === 'limited' || s.status === 'none'
/** Bigger load → bigger marker, on a square-root scale so 120 MVA does not dwarf 15 MVA. */
const radiusOf = (loadMva: number) => 7.5 + Math.sqrt(Math.max(0, loadMva)) * 0.95

// tooltips are HTML strings, and the texts come from the database
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Latin runs are isolated so "33 kV" or "NG-101" keep their order inside RTL text
const ltr = (text: string) => `<bdi dir="ltr" class="num">${escapeHtml(text)}</bdi>`

function stationTooltip(s: MapStation): string {
  return (
    `<div dir="rtl" class="rc-tip"><div><b>${ltr(s.code)}</b> · ${escapeHtml(s.district)}</div>` +
    `<div class="rc-tip__status rc-status--${s.status}"><i></i>${STATUS[s.status].label}</div>` +
    `<div class="rc-tip__facts">قدرة الاستعادة <b>${ltr(`${s.capacityPct}%`)}</b> · الحمل <b>${ltr(`${fmt(s.loadMva, 1)} MVA`)}</b></div></div>`
  )
}

function tieTooltip(t: MapTie): string {
  const ends = `${ltr(`${t.from.code}/${t.fromFeederCode}`)} ↔ ${ltr(`${t.to.code}/${t.toFeederCode}`)}`
  const kind = `${CONSTRUCTION_LABEL[t.construction]}${t.circuits === 2 ? ' · دائرتان' : ''} · ${SWITCHING_LABEL[t.switching]}`
  return `<div dir="rtl">${ends}<br>${kind} · ${ltr(`${fmt(t.capacityMva)} MVA`)}</div>`
}

// how near (in degrees) a neighbour must stand, east or west, to sit on a station's name
const LABEL_REACH = { lat: 0.02, lng: 0.06 }

const crowded = (s: MapStation, all: MapStation[], side: 1 | -1) =>
  all.some((o) => {
    const east = (o.location.lng - s.location.lng) * side
    return o !== s && east > 0 && east < LABEL_REACH.lng && Math.abs(o.location.lat - s.location.lat) < LABEL_REACH.lat
  })

// The name beside a marker: the stylesheet shows it from a zoom where names no longer
// pile up. It goes to the right, unless a neighbour stands there and the left is free.
function stationLabel(s: MapStation, radius: number, all: MapStation[]): L.DivIcon {
  const side = crowded(s, all, 1) && !crowded(s, all, -1) ? ' class="is-left"' : ''
  return L.divIcon({
    className: 'rc-map__label',
    iconSize: [0, 0],
    html: `<span${side} style="--rc-label-gap:${Math.round(radius) + 7}px"><b class="num">${escapeHtml(s.code)}</b><i class="num rc-status--${s.status}">${s.capacityPct}%</i></span>`,
  })
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

function drawTies(ties: MapTie[], themed: Themed) {
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

/** Ties first, then every halo, then the markers: a halo never dims a neighbouring station. */
export function drawNetwork({ group, themed, stations, ties, layers, selectedId, onSelect }: NetworkDrawing) {
  if (layers.ties) drawTies(ties, themed)

  for (const s of stations) {
    if (!isWeak(s)) continue
    // the stylesheet makes it breathe; the status colours are the same in both themes
    L.circleMarker([s.location.lat, s.location.lng], {
      radius: radiusOf(s.loadMva) + 2,
      color: STATUS[s.status].color,
      fillColor: STATUS[s.status].color,
      fillOpacity: 0.3,
      interactive: false,
      className: 'rc-map__halo',
    }).addTo(group)
  }

  for (const s of stations) {
    const at: L.LatLngTuple = [s.location.lat, s.location.lng]
    const radius = radiusOf(s.loadMva)
    const ring = (extra: number, color: (c: MapColors) => string, options: L.PathOptions = {}) =>
      themed(
        L.circleMarker(at, { radius: radius + extra, weight: 2, fill: false, interactive: false, ...options }),
        (c) => ({ color: color(c) }),
      )

    if (layers.sensitive && s.sensitive) ring(4, (c) => c.sensitive)
    if (layers.vip && s.vip) ring(layers.sensitive && s.sensitive ? 8 : 4, (c) => c.vip, { dashArray: '3 4' })
    if (s.id === selectedId) {
      ring(12, (c) => c.selection, { weight: 9, opacity: 0.16 })
      ring(12, (c) => c.selection, { weight: 3 })
    }

    themed(
      L.circleMarker(at, {
        radius,
        fillColor: STATUS[s.status].color,
        fillOpacity: 1,
        bubblingMouseEvents: false,
        // the stylesheet hangs the light theme's drop shadow on this
        className: 'rc-map__station',
      }),
      (c) => ({ color: c.markerStroke, weight: c.markerStrokeWeight }),
    )
      .bindTooltip(stationTooltip(s), { direction: 'top', offset: [0, -radius - 2], className: 'rc-tooltip' })
      .on('click', () => onSelect(s.id))

    L.marker(at, { icon: stationLabel(s, radius, stations), pane: LABEL_PANE, interactive: false, keyboard: false }).addTo(group)
  }
}
