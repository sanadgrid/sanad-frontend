import L from 'leaflet'
import { ordinal } from '../backup/format'
import type { LoadingLevel } from '../backup/model'
import { fmt } from '../labels'
import type { LatLng } from '../types'

/** Above everything imported (350), under the network's own ties and stations (400). */
export const PLAN_PANE = 'rc-plans'
export const PLAN_PANE_Z = 380

export interface PlanLink {
  /** Its place in the plan: 0 = first backup. */
  order: number
  no: string
  at: LatLng
  transferA: number
  level: LoadingLevel
}

/** A backup plan as the map draws it; stations the imported layers do not know are simply absent. */
export interface PlanDrawing {
  id: string
  main: { no: string; at: LatLng }
  links: PlanLink[]
  /** The plan being read: the others, when all are shown, stand back. */
  selected: boolean
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const tuple = (p: LatLng): L.LatLngTuple => [p.lat, p.lng]
const icon = (html: string, className: string) => L.divIcon({ className, iconSize: [0, 0], html })

/**
 * Colours, the dash that flows toward the main station and the dimming of
 * unselected plans are all the stylesheet's: a change of theme repaints nothing.
 */
export function drawPlans(group: L.LayerGroup, plans: PlanDrawing[], onSelect: (planId: string) => void) {
  group.clearLayers()
  // the plan being read goes on last, over the others
  for (const plan of [...plans].sort((a, b) => Number(a.selected) - Number(b.selected))) {
    const state = plan.selected ? ' is-selected' : ''
    const path = { pane: PLAN_PANE, interactive: false }
    for (const link of plan.links) {
      // from the backup toward the main station: the dash offset runs that way
      const line = [tuple(link.at), tuple(plan.main.at)]
      L.polyline(line, { ...path, className: `rc-plan-casing${state}` }).addTo(group)
      L.polyline(line, { ...path, className: `rc-plan-link rc-plan-link--${link.level}${state}` }).addTo(group)
    }
    for (const link of plan.links) {
      L.marker(tuple(link.at), {
        pane: PLAN_PANE,
        interactive: false,
        keyboard: false,
        icon: icon(
          `<span class="rc-plan-badge rc-plan-badge--${link.level}${state}"><i>${ordinal(link.order)}</i><b class="num">${escapeHtml(link.no)}</b></span>`,
          'rc-plan-marker',
        ),
      }).addTo(group)
      if (!plan.selected) continue
      const middle: L.LatLngTuple = [(link.at.lat + plan.main.at.lat) / 2, (link.at.lng + plan.main.at.lng) / 2]
      L.marker(middle, {
        pane: PLAN_PANE,
        interactive: false,
        keyboard: false,
        icon: icon(`<span class="rc-plan-amps rc-plan-amps--${link.level} num" dir="ltr">${fmt(link.transferA)} A</span>`, 'rc-plan-marker'),
      }).addTo(group)
    }
    L.marker(tuple(plan.main.at), {
      pane: PLAN_PANE,
      keyboard: false,
      icon: icon(`<span class="rc-plan-main${state}"><i></i><b class="num">${escapeHtml(plan.main.no)}</b></span>`, 'rc-plan-marker'),
    })
      .on('click', () => onSelect(plan.id))
      .addTo(group)
  }
}
