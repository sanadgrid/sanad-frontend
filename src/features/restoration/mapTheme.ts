import type { Theme } from './useTheme'

// Colours Leaflet draws with. They are set from JS, so they cannot come from the
// stylesheet's tokens; the legend reads the same object to stay in step.
export interface MapColors {
  tieUnderground: string
  tieOverhead: string
  /** A tie with a limited / unrestorable station at either end. */
  tieWeak: string
  tieOpacity: number
  /** The core that splits a double-circuit tie into two strokes. */
  tieCore: string
  markerStroke: string
  markerStrokeWeight: number
  selection: string
  sensitive: string
  vip: string
  /** The number beside a station of an imported layer; `markerStroke` is its halo. */
  importedLabel: string
}

const COLORS: Record<Theme, MapColors> = {
  // on the pale basemap: saturated mid-tones, and a white rim lifts the markers
  light: {
    tieUnderground: '#0878c9',
    tieOverhead: '#1b9a91',
    tieWeak: '#e11d48',
    tieOpacity: 0.9,
    tieCore: '#ffffff',
    markerStroke: '#ffffff',
    markerStrokeWeight: 3,
    selection: '#0a2340',
    sensitive: '#d6247a',
    vip: '#9a6a1f',
    importedLabel: '#0a2340',
  },
  // on the inverted basemap: light tints, and a navy rim separates the markers
  dark: {
    tieUnderground: '#5fe6f0',
    tieOverhead: '#5fe6f0',
    tieWeak: '#ff6b81',
    tieOpacity: 0.8,
    tieCore: '#061b35',
    markerStroke: '#061b35',
    markerStrokeWeight: 2,
    selection: '#ffffff',
    sensitive: '#ff9ecb',
    vip: '#d7b58a',
    importedLabel: '#eaf5ff',
  },
}

export const themeColors = (theme: Theme): MapColors => COLORS[theme]
