import { useId } from 'react'
import type { Status } from '../../restoration/engine'
import {
  criticalSites,
  feederStubs,
  idleTies,
  loadPoints,
  loss,
  LOST,
  stations,
  statusOfPercent,
  transferPaths,
  VIEW,
} from './scene'
import './NetworkMap.css'

interface NetworkMapProps {
  /** `loss`: one station is out and its backups feed it. `overview`: every station by its status. */
  mode: 'loss' | 'overview'
  /** Station code drawn with a selection ring (overview only). */
  selected?: string
  label: string
}

const amps = (value: number) => `${Math.round(value).toLocaleString('en-US')} A`

interface StationLabelProps {
  code: string
  tag: string
  status: Status | 'lost'
  at: [dx: number, dy: number]
}

function StationLabel({ code, tag, status, at }: StationLabelProps) {
  return (
    <g className={`netmap__label netmap__label--${status}`} transform={`translate(${at[0]} ${at[1]})`}>
      <rect x="-54" y="-11" width="108" height="22" rx="11" />
      <text x="-44" y="4">
        S/S {code}
      </text>
      <text className="netmap__tag" x="44" y="4" textAnchor="end">
        {tag}
      </text>
    </g>
  )
}

export function NetworkMap({ mode, selected, label }: NetworkMapProps) {
  const id = useId()
  const lossMode = mode === 'loss'
  const lostPercent = Math.round(loss.ratio * 100)

  return (
    <div className={`netmap netmap--${mode}`}>
      <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={label}>
        <defs>
          <pattern id={`${id}streets`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" className="netmap__street" />
          </pattern>
          <linearGradient id={`${id}flow`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#1668e3" />
            <stop offset="1" stopColor="#00b3c6" />
          </linearGradient>
          <filter id={`${id}lift`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#071b34" floodOpacity=".18" />
          </filter>
        </defs>

        {/* the streets run past the canvas, so a wider box shows more city, not blank margins */}
        <rect x="-320" y="-200" width="1280" height="920" fill={`url(#${id}streets)`} />
        <path className="netmap__artery" d="M-320 300H960M200-200V720M-320 140H960M480-200V720" />
        <path className="netmap__zone" d="M176 148 468 118 500 366 214 396Z" />

        <path className="netmap__stub" d={feederStubs} />
        {loadPoints.map(([x, y]) => (
          <circle className="netmap__load" key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
        ))}

        {idleTies.map((tie) => (
          <g key={tie.d}>
            <path className="netmap__tie" d={tie.d} />
            <rect className="netmap__open" x={tie.open.x - 4.5} y={tie.open.y - 4.5} width="9" height="9" rx="2" />
          </g>
        ))}

        {transferPaths.map((path, i) =>
          lossMode ? (
            <g key={path.d}>
              <path className="netmap__transfer-bed" d={path.d} />
              <path className="netmap__transfer" d={path.d} stroke={`url(#${id}flow)`} style={{ animationDelay: `${i * -0.6}s` }} />
            </g>
          ) : (
            <path className="netmap__tie" key={path.d} d={path.d} />
          ),
        )}

        {criticalSites.map((site) => (
          <g className={`netmap__site netmap__site--${site.kind}`} key={site.kind} transform={`translate(${site.x} ${site.y})`}>
            <rect x="-9" y="-9" width="18" height="18" rx="5" />
            <path d={site.kind === 'sensitive' ? 'M0-5V5M-5 0H5' : 'M0-5 5 0 0 5-5 0Z'} />
          </g>
        ))}

        {stations.map((s) => {
          const status = statusOfPercent(s.percent)
          const order = lossMode ? loss.transfers.findIndex((t) => t.no === s.code) : -1
          return (
            <g className={`netmap__station netmap__station--${status}`} key={s.code} transform={`translate(${s.x} ${s.y})`}>
              {selected === s.code && <circle className="netmap__selection" r="21" />}
              <circle className="netmap__halo" r="15" filter={`url(#${id}lift)`} />
              <circle className="netmap__dot" r="10" />
              {order >= 0 && (
                <g className="netmap__order" transform="translate(17 13)">
                  <circle r="9" />
                  <text y="3.8" textAnchor="middle">
                    {order + 1}
                  </text>
                </g>
              )}
              <StationLabel code={s.code} tag={`${s.percent}%`} status={status} at={s.label} />
            </g>
          )
        })}

        {lossMode ? (
          <g className="netmap__station netmap__station--lost" transform={`translate(${LOST.x} ${LOST.y})`}>
            <circle className="netmap__pulse" r="15" />
            <circle className="netmap__pulse netmap__pulse--late" r="15" />
            <circle className="netmap__halo" r="15" filter={`url(#${id}lift)`} />
            <circle className="netmap__dot" r="10" />
            <path className="netmap__cross" d="M-4-4 4 4M4-4-4 4" />
            <StationLabel code={LOST.code} tag="OUT" status="lost" at={LOST.label} />
          </g>
        ) : (
          <g className={`netmap__station netmap__station--${loss.status}`} transform={`translate(${LOST.x} ${LOST.y})`}>
            {selected === LOST.code && <circle className="netmap__selection" r="21" />}
            <circle className="netmap__halo" r="15" filter={`url(#${id}lift)`} />
            <circle className="netmap__dot" r="10" />
            <StationLabel code={LOST.code} tag={`${lostPercent}%`} status={loss.status} at={LOST.label} />
          </g>
        )}

        {lossMode &&
          transferPaths.map((path, i) => (
            <g className="netmap__amps" key={path.d} transform={`translate(${path.label.x} ${path.label.y})`}>
              <rect x="-31" y="-12" width="62" height="24" rx="12" />
              <text y="4.5" textAnchor="middle">
                {amps(loss.transfers[i].transferA)}
              </text>
            </g>
          ))}
      </svg>
    </div>
  )
}
