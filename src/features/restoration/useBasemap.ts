import { useState } from 'react'

/** How much of the basemap shows through: street names compete with the stations, so it opens faded. */
export type Basemap = 'faint' | 'medium' | 'clear'

export const BASEMAPS: Basemap[] = ['faint', 'medium', 'clear']
export const DEFAULT_BASEMAP: Basemap = 'faint'

const STORAGE_KEY = 'sanad.rc.basemap'

function readBasemap(): Basemap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return BASEMAPS.find((b) => b === stored) ?? DEFAULT_BASEMAP
  } catch {
    // blocked site data: the page opens faded every time
    return DEFAULT_BASEMAP
  }
}

/** The stylesheet does the fading from an attribute on the page: the map and its tiles are never touched. */
export function useBasemap() {
  const [basemap, setBasemap] = useState<Basemap>(readBasemap)

  const choose = (next: Basemap) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // the choice still holds for this visit
    }
    setBasemap(next)
  }

  return [basemap, choose] as const
}
