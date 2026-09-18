import L from 'leaflet'
import type { CompactFeature, Position } from '../import/types'

/** Below Leaflet's overlay pane (400), where the ties and stations are drawn. */
export const IMPORTED_PANE = 'rc-imported'
export const IMPORTED_PANE_Z = 350

export interface ImportedStyle {
  color: string
  /** The rim that lifts a point off the basemap. */
  rim: string
}

// what a drawn shape says when it is hovered or clicked
const info = new WeakMap<L.Layer, CompactFeature>()

// names and descriptions come from a file: they are never trusted as markup
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const flip = ([lng, lat]: Position): L.LatLngTuple => [lat, lng]
const sameLabel = (a: CompactFeature, b: CompactFeature) => a.n === b.n && a.d === b.d

const nameHtml = (f: CompactFeature) => `<div dir="auto">${escapeHtml(f.n)}</div>`
const detailHtml = (f: CompactFeature) =>
  `<div dir="auto">${f.n ? `<b>${escapeHtml(f.n)}</b>` : ''}${f.d ? `<p>${escapeHtml(f.d)}</p>` : ''}</div>`

/**
 * One Leaflet layer per feature, except lines: a drawing converted from CAD is
 * thousands of short segments under one name, and those become a single
 * multi-line — one object to draw and to hit-test instead of thousands.
 */
export function drawImportedLayer(features: CompactFeature[], renderer: L.Renderer): L.FeatureGroup {
  const shared = { renderer, pane: IMPORTED_PANE }
  const group = L.featureGroup()
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i]
    let shape: L.Path
    if (feature.t === 'p') shape = L.circleMarker(flip(feature.c), { ...shared, radius: 4, weight: 1, fillOpacity: 0.9 })
    else if (feature.t === 'g')
      shape = L.polygon(feature.c.map((ring) => ring.map(flip)), { ...shared, weight: 1.6, fillOpacity: 0.12 })
    else {
      const lines = [feature.c.map(flip)]
      for (let next = features[i + 1]; next?.t === 'l' && sameLabel(feature, next); next = features[i + 1]) {
        lines.push(next.c.map(flip))
        i += 1
      }
      shape = L.polyline(lines, { ...shared, weight: 2.2, opacity: 0.9 })
    }
    info.set(shape, feature)
    group.addLayer(shape)
  }
  return group
}

export function paintImportedLayer(group: L.FeatureGroup, { color, rim }: ImportedStyle) {
  group.eachLayer((layer) => {
    if (layer instanceof L.CircleMarker) layer.setStyle({ color: rim, fillColor: color })
    else if (layer instanceof L.Path) layer.setStyle({ color, fillColor: color })
  })
}

/** A name on hover and the details on click, with one tooltip for the whole layer. */
export function describeOnMap(group: L.FeatureGroup, map: L.Map) {
  const tooltip = L.tooltip({ className: 'rc-tooltip', direction: 'top', offset: [0, -6] })
  group
    .on('mouseover', (event: L.LeafletMouseEvent) => {
      const feature = info.get(event.propagatedFrom)
      if (feature?.n) map.openTooltip(tooltip.setContent(nameHtml(feature)).setLatLng(event.latlng))
    })
    .on('mousemove', (event: L.LeafletMouseEvent) => tooltip.setLatLng(event.latlng))
    .on('mouseout remove', () => map.closeTooltip(tooltip))
    .on('click', (event: L.LeafletMouseEvent) => {
      const feature = info.get(event.propagatedFrom)
      if (!feature || (!feature.n && !feature.d)) return
      L.popup({ className: 'rc-popup', maxWidth: 300, maxHeight: 240 })
        .setLatLng(event.latlng)
        .setContent(detailHtml(feature))
        .openOn(map)
    })
}
