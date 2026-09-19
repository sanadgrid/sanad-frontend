import { useEffect, useState } from 'react'

const COPIED_MS = 1500

/** A station's FLOCSAP, copied with a click: the number the asset register knows it by. */
export function FlocChip({ floc, no }: { floc: string; no?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => navigator.clipboard?.writeText(floc).then(() => setCopied(true), () => {})

  return (
    <span className="rc-floc__chip">
      {no && (
        <bdi className="num" dir="ltr">
          {no}
        </bdi>
      )}
      <button className="rc-floc" type="button" dir="ltr" title="نسخ FLOCSAP" aria-label={`نسخ FLOCSAP ${floc}`} onClick={copy}>
        <small>FLOCSAP</small> {floc}
      </button>
      {copied && (
        <span className="rc-floc__copied" role="status">
          تم النسخ
        </span>
      )}
    </span>
  )
}
