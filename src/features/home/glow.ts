import type { PointerEvent } from 'react'

// Pointer-follow highlight: writes the pointer position into --gx / --gy on the
// nearest [data-glow] element, where HomePage.css paints a radial gradient.
export function trackGlow(e: PointerEvent<HTMLElement>) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-glow]')
  if (!el) return
  const r = el.getBoundingClientRect()
  el.style.setProperty('--gx', `${e.clientX - r.left}px`)
  el.style.setProperty('--gy', `${e.clientY - r.top}px`)
}
