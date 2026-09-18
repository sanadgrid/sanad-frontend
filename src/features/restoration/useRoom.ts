import { useEffect, useState, type RefObject } from 'react'

/** Whether an element is at least this large — it is watched, so panels opening around it count. */
export function useRoom(element: RefObject<HTMLElement | null>, minWidth: number, minHeight: number): boolean {
  const [roomy, setRoomy] = useState(true)

  useEffect(() => {
    const target = element.current
    if (!target) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setRoomy(width >= minWidth && height >= minHeight)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [element, minWidth, minHeight])

  return roomy
}
