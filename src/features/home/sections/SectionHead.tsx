interface SectionHeadProps {
  kicker: string
  title: string
  sub?: string
  /** Centre the block instead of aligning it to the reading edge. */
  centered?: boolean
}

export function SectionHead({ kicker, title, sub, centered }: SectionHeadProps) {
  return (
    <div className={`section-head reveal${centered ? ' section-head--centered' : ''}`}>
      <span className="kicker" dir="ltr" lang="en">
        {kicker}
      </span>
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
    </div>
  )
}
