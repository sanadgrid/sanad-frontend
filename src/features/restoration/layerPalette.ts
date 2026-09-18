import type { CSSProperties } from 'react'
import type { Theme } from './useTheme'

// Colours of imported layers. Each entry is one hue in two strengths: a deep tone
// for the pale basemap and a tint for the navy one. The deep tone is what gets
// stored with the layer; the tint is looked up from it. The hues keep away from
// the blues and cyans of the tie lines and from the orange-to-red of the statuses.
const PALETTE: { light: string; dark: string }[] = [
  { light: '#6d28d9', dark: '#c4b5fd' },
  { light: '#4d7c0f', dark: '#bef264' },
  { light: '#be185d', dark: '#f9a8d4' },
  { light: '#3730a3', dark: '#a5b4fc' },
  { light: '#92400e', dark: '#e7c08a' },
  { light: '#a21caf', dark: '#f0abfc' },
  { light: '#3f4d63', dark: '#cbd5e1' },
  { light: '#166534', dark: '#86efac' },
]

/** The colour stored with the n-th layer of an import. */
export const paletteColor = (index: number) => PALETTE[index % PALETTE.length].light

/** A stored colour as it should be drawn in `theme`; a colour from outside the palette is used as it is. */
export const layerColor = (stored: string, theme: Theme) =>
  (theme === 'dark' && PALETTE.find((entry) => entry.light === stored)?.dark) || stored

/** Both strengths as custom properties: the stylesheet picks the one that suits the theme. */
export const swatchStyle = (stored: string) =>
  ({ '--rc-swatch': stored, '--rc-swatch-dark': layerColor(stored, 'dark') }) as CSSProperties
