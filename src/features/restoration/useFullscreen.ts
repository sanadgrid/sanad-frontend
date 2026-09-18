import { useCallback, useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  document.addEventListener('fullscreenchange', notify)
  return () => document.removeEventListener('fullscreenchange', notify)
}

/** Full screen for the whole page shell, so the panels and the dialogs come along with the map. */
export function useFullscreen(rootSelector: string) {
  const active = useSyncExternalStore(subscribe, () => document.fullscreenElement !== null)

  const toggle = useCallback(
    (from: Element) => {
      const request = document.fullscreenElement ? document.exitFullscreen() : from.closest(rootSelector)?.requestFullscreen()
      // refused by the browser (no user gesture, embedded frame): the page simply stays as it is
      request?.catch(() => {})
    },
    [rootSelector],
  )

  return { supported: document.fullscreenEnabled === true, active, toggle }
}
