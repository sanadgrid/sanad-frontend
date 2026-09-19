import { useState } from 'react'

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored === '1'
  } catch {
    // blocked site data: the page opens as it was designed to every time
    return fallback
  }
}

/** A switch of the page that is remembered on this device — what it shows, never what it holds. */
export function useStoredFlag(key: string, fallback: boolean) {
  const [on, setOn] = useState(() => read(key, fallback))

  const choose = (next: boolean) => {
    try {
      localStorage.setItem(key, next ? '1' : '0')
    } catch {
      // the choice still holds for this visit
    }
    setOn(next)
  }

  return [on, choose] as const
}
