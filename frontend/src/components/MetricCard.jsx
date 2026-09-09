import { useId } from 'react'

// Sparkline: the shape of a series as card texture, not a chart. No axes or
// ticks — it reads as a trend behind the number, so it stays cheap to glance at.
function Sparkline({ points, color }) {
  // useId keeps each card's gradient unique; a value-derived id could collide
  // between two cards and make one of them borrow the other's fill. Its output
  // contains colons, which have to go before it can be used in url(#...).
  const id = `sp${useId().replace(/:/g, '')}`
  const clean = (points ?? []).filter(v => typeof v === 'number' && Number.isFinite(v))
  if (clean.length < 2) return null

  // Cap the sample so a 700-day series doesn't emit a 700-point path.
  const MAX = 72
  const step = Math.max(1, Math.floor(clean.length / MAX))
  const vals = clean.filter((_, i) => i % step === 0)
  if (vals[vals.length - 1] !== clean[clean.length - 1]) vals.push(clean[clean.length - 1])

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const W = 100, H = 30

  const xy = vals.map((v, i) => [
    (i / (vals.length - 1)) * W,
    H - ((v - min) / span) * H,
  ])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')
  const area = `${line}L${W},${H}L0,${H}Z`

  return (
    <div className="metric-spark" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function MetricCard({
  label, value, secondary, variant, onClick,
  tier = 'default',      // 'hero' | 'supporting' | 'default'
  spark,                 // array of numbers
  sparkColor,
}) {
  const v = variant === 'gain' ? 'gain' : variant === 'loss' ? 'loss' : ''
  const tierCls = tier === 'hero' ? 'tier-hero' : tier === 'supporting' ? 'tier-supporting' : ''
  const cardCls = ['metric-card', v, tierCls, onClick ? 'metric-card-clickable' : '']
    .filter(Boolean).join(' ')

  const body = (
    <>
      <div className="metric-label">{label}</div>
      <div className={['metric-value', v].filter(Boolean).join(' ')}>{value}</div>
      {secondary && <div className="metric-secondary">{secondary}</div>}
      {onClick && <div className="metric-hint">click for details</div>}
      {spark?.length > 1 && (
        <Sparkline
          points={spark}
          color={sparkColor ?? (v === 'loss' ? 'var(--red)' : v === 'gain' ? 'var(--green)' : 'var(--cyan)')}
        />
      )}
    </>
  )

  // A clickable card is a button so it is reachable and operable by keyboard.
  return onClick
    ? <button type="button" className={cardCls} onClick={onClick}>{body}</button>
    : <div className={cardCls}>{body}</div>
}
