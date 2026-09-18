import { useSyncExternalStore } from 'react'

/** The width from which the map fills the page and the panels float over it (mirrored in the stylesheet). */
export const WIDE_SCREEN = '(min-width: 1100px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
  )
}
