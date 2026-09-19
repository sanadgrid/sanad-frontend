import type { Theme } from './useTheme'

// Colours Leaflet draws with. They are set from JS, so they cannot come from the
// stylesheet's tokens. (The links and the support-only rings are styled by class,
// so they do take the stylesheet's.)
export interface MapColors {
  markerStroke: string
  markerStrokeWeight: number
  selection: string
  /** The number beside a station of an imported layer; `markerStroke` is its halo. */
  importedLabel: string
  /** A station that can be clicked into the plan being written; `markerStroke` is its rim. */
  pickable: string
  /** Every station of the sector, as a quiet square under the plans, and the number beside it. */
  baseStation: string
  baseLabel: string
}

const COLORS: Record<Theme, MapColors> = {
  // on the pale basemap: a white rim lifts the markers
  light: {
    markerStroke: '#ffffff',
    markerStrokeWeight: 3,
    selection: '#0a2340',
    importedLabel: '#0a2340',
    pickable: '#0878c9',
    baseStation: '#7c8da1',
    baseLabel: '#46586d',
  },
  // on the inverted basemap: a navy rim separates the markers
  dark: {
    markerStroke: '#061b35',
    markerStrokeWeight: 2,
    selection: '#ffffff',
    importedLabel: '#eaf5ff',
    pickable: '#5fe6f0',
    baseStation: '#6f86a0',
    baseLabel: '#b4c5d8',
  },
}

export const themeColors = (theme: Theme): MapColors => COLORS[theme]
