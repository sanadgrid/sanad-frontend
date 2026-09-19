import L from 'leaflet'
import { loadingLabel } from '../backup/format'
import type { LoadingLevel } from '../backup/model'
import type { Status } from '../engine'
import { fmt, STATUS } from '../labels'
import type { MapColors } from '../mapTheme'
import type { LatLng } from '../types'
import { PLAN_PANE } from './planLinks'

/** A station of the plans, as the map draws it. */
export interface MapNode {
  key: string
  no: string
  name: string | null
  at: LatLng
  /** The class of its own plan; `null` for a station that only ever backs others up. */
  status: Status | null
  /** Beside its number: the restoration ratio of its plan, or the worst loading it would end at. */
  figure: string
  /** How far its worst case loads it, when it backs anything up. */
  worstLevel: LoadingLevel | null
  loadA: number
  loadMva: number
  nowPct: number | null
  worstPct: number | null
  demo: boolean
}

/** A backup standing behind a main element. */
export interface MapLink {
  id: string
  caseId: string
  from: LatLng
  to: LatLng
  pair: string
  backupNo: string
  mainNo: string
  transferA: number
  finalLoadingPct: number
  level: LoadingLevel
}

/** Station names sit above the network's SVG (400) and under Leaflet's tooltips (650). */
export const LABEL_PANE = 'rc-labels'
export const LABEL_PANE_Z = 450

/** Adds a layer whose colours follow the theme. */
export type Themed = <T extends L.Path>(layer: T, style: (c: MapColors) => L.PathOptions) => T

interface NetworkDrawing {
  group: L.LayerGroup
  themed: Themed
  nodes: MapNode[]
  links: MapLink[]
  selectedKey: string | null
  /** The case being read: its links are drawn by the plan layer, with the flow and the amperes. */
  selectedCaseId: string | null
  onSelect: (key: string) => void
}

const SUPPORT_RADIUS = 7
// links between the same two stations — each backs the other up — are set apart by this many degrees
const FAN_STEP = 0.0016

const isWeak = (n: MapNode) => n.status === 'limited' || n.status === 'none'
/** Bigger load → bigger marker, on a square-root scale so 600 A does not dwarf 100 A. */
const radiusOf = (n: MapNode) => (n.status ? 7 + Math.sqrt(Math.max(0, n.loadA)) * 0.45 : SUPPORT_RADIUS)

// tooltips are HTML strings, and the texts come from the database
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Latin runs are isolated so "13.8 kV" or "7001/F3" keep their order inside RTL text
const ltr = (text: string) => `<bdi dir="ltr" class="num">${escapeHtml(text)}</bdi>`
const amps = (value: number) => ltr(`${fmt(value)} A`)

function nodeTooltip(n: MapNode): string {
  const head = `<div><b>${ltr(n.no)}</b>${n.name ? ` · ${escapeHtml(n.name)}` : ''}${n.demo ? ' · <span class="rc-demo-chip">تجريبي</span>' : ''}</div>`
  const load = `الحمل <b>${amps(n.loadA)}</b> · ${ltr(`${fmt(n.loadMva, 1)} MVA`)}`
  const backing = n.worstPct === null ? '' : `<div class="rc-tip__facts">كبديل: تحميله الآن <b>${ltr(loadingLabel(n.nowPct ?? 0))}</b> · في أسوأ حالة <b>${ltr(loadingLabel(n.worstPct))}</b></div>`
  if (!n.status) return `<div dir="rtl" class="rc-tip">${head}<div class="rc-tip__status"><i></i>بديل فقط — ليست له خطة</div><div class="rc-tip__facts">${load}</div>${backing}</div>`
  return (
    `<div dir="rtl" class="rc-tip">${head}<div class="rc-tip__status rc-status--${n.status}"><i></i>${STATUS[n.status].label}</div>` +
    `<div class="rc-tip__facts">نسبة الاستعادة <b>${ltr(n.figure)}</b> · ${load}</div>${backing}</div>`
  )
}

const linkTooltip = (l: MapLink) =>
  `<div dir="rtl">البديل ${ltr(l.backupNo)} ← ${ltr(l.mainNo)}<br>يستقبل <b>${amps(l.transferA)}</b> · تحميله بعدها <b>${ltr(loadingLabel(l.finalLoadingPct))}</b></div>`

// how near (in degrees) a neighbour must stand, east or west, to sit on a station's name
const LABEL_REACH = { lat: 0.02, lng: 0.06 }

const crowded = (n: MapNode, all: MapNode[], side: 1 | -1) =>
  all.some((o) => {
    const east = (o.at.lng - n.at.lng) * side
    return o !== n && east > 0 && east < LABEL_REACH.lng && Math.abs(o.at.lat - n.at.lat) < LABEL_REACH.lat
  })

// The name beside a marker: the stylesheet shows it from a zoom where names no longer
// pile up. It goes to the right, unless a neighbour stands there and the left is free.
function nodeLabel(n: MapNode, radius: number, all: MapNode[]): L.DivIcon {
  const side = crowded(n, all, 1) && !crowded(n, all, -1) ? ' is-left' : ''
  const tone = n.status ? `rc-status--${n.status}` : `rc-net-loading--${n.worstLevel ?? 'calm'}`
  return L.divIcon({
    className: 'rc-map__label',
    iconSize: [0, 0],
    html: `<span class="${n.status ? '' : 'is-support'}${side}" style="--rc-label-gap:${Math.round(radius) + 7}px"><b class="num">${escapeHtml(n.no)}</b><i class="num ${tone}">${n.figure}</i></span>`,
  })
}

/** The i-th of n links between the same two stations, shifted sideways off the straight line. */
function fan(from: LatLng, to: LatLng, i: number, n: number): L.LatLngTuple[] {
  // one orientation per pair, so the two directions fall on opposite sides
  const flip = from.lat < to.lat || (from.lat === to.lat && from.lng < to.lng) ? 1 : -1
  const dLat = (to.lat - from.lat) * flip
  const dLng = (to.lng - from.lng) * flip
  const length = Math.hypot(dLat, dLng) || 1
  const offset = (i - (n - 1) / 2) * FAN_STEP
  const oLat = (-dLng / length) * offset
  const oLng = (dLat / length) * offset
  return [
    [from.lat + oLat, from.lng + oLng],
    [to.lat + oLat, to.lng + oLng],
  ]
}

function drawLinks(group: L.LayerGroup, links: MapLink[], selectedCaseId: string | null) {
  const pairs = new Map<string, MapLink[]>()
  for (const link of links) pairs.set(link.pair, [...(pairs.get(link.pair) ?? []), link])
  const dimmed = selectedCaseId ? ' is-dimmed' : ''
  for (const bundle of pairs.values())
    bundle.forEach((link, i) => {
      if (link.caseId === selectedCaseId) return
      const path = fan(link.from, link.to, i, bundle.length)
      // colours are the stylesheet's: a change of theme repaints nothing
      L.polyline(path, { pane: PLAN_PANE, interactive: false, className: `rc-net-casing${dimmed}` }).addTo(group)
      L.polyline(path, { pane: PLAN_PANE, className: `rc-net-link rc-net-link--${link.level}${dimmed}` })
        .bindTooltip(linkTooltip(link), { sticky: true, className: 'rc-tooltip' })
        .addTo(group)
    })
}

/** Links first, then every halo, then the markers: a halo never dims a neighbouring station. */
export function drawPlanNetwork({ group, themed, nodes, links, selectedKey, selectedCaseId, onSelect }: NetworkDrawing) {
  drawLinks(group, links, selectedCaseId)

  for (const n of nodes) {
    if (!n.status || !isWeak(n)) continue
    // the stylesheet makes it breathe; the status colours are the same in both themes
    L.circleMarker([n.at.lat, n.at.lng], {
      radius: radiusOf(n) + 2,
      color: STATUS[n.status].color,
      fillColor: STATUS[n.status].color,
      fillOpacity: 0.3,
      interactive: false,
      className: 'rc-map__halo',
    }).addTo(group)
  }

  // stations that only back others up go under those that have a plan, the weakest plan on top
  const order = (n: MapNode) => (n.status ? ['full', 'high', 'limited', 'none'].indexOf(n.status) + 1 : 0)
  for (const n of [...nodes].sort((a, b) => order(a) - order(b))) {
    const at: L.LatLngTuple = [n.at.lat, n.at.lng]
    const radius = radiusOf(n)
    if (n.key === selectedKey)
      for (const options of [{ weight: 9, opacity: 0.16 }, { weight: 3 }])
        themed(L.circleMarker(at, { radius: radius + 10, fill: false, interactive: false, ...options }), (c) => ({ color: c.selection }))

    const marker = n.status
      ? themed(
          // the stylesheet hangs the light theme's drop shadow on this
          L.circleMarker(at, { radius, fillColor: STATUS[n.status].color, fillOpacity: 1, bubblingMouseEvents: false, className: 'rc-map__station' }),
          (c) => ({ color: c.markerStroke, weight: c.markerStrokeWeight }),
        )
      : // a neutral ring: its colours are the stylesheet's
        L.circleMarker(at, { radius, weight: 3, fillOpacity: 1, bubblingMouseEvents: false, className: `rc-net-support rc-net-support--${n.worstLevel ?? 'calm'}` }).addTo(group)
    marker.bindTooltip(nodeTooltip(n), { direction: 'top', offset: [0, -radius - 2], className: 'rc-tooltip' }).on('click', () => onSelect(n.key))

    L.marker(at, { icon: nodeLabel(n, radius, nodes), pane: LABEL_PANE, interactive: false, keyboard: false }).addTo(group)
  }
}
