import { useCallback, useEffect, useState } from 'react'

/** A short message at the foot of the page; with an action, something that can still be taken back. */
export interface ToastMessage {
  kind: 'ok' | 'error' | 'notice'
  text: string
  action?: { label: string; run: () => void }
}

const TOAST_MS = 6000
// long enough to read the message and reach the button
const ACTION_MS = 10_000

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.action ? ACTION_MS : TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const dismiss = useCallback(() => setToast(null), [])
  return { toast, show: setToast, dismiss }
}
