export default function MetricCard({ label, value, secondary, variant, onClick }) {
  const v = variant === 'gain' ? 'gain' : variant === 'loss' ? 'loss' : ''
  const cls = ['metric-value', v].join(' ').trim()
  const cardCls = ['metric-card', v, onClick ? 'metric-card-clickable' : ''].filter(Boolean).join(' ')
  return (
    <div className={cardCls} onClick={onClick}>
      <div className="metric-label">{label}</div>
      <div className={cls}>{value}</div>
      {secondary && <div className="metric-secondary">{secondary}</div>}
      {onClick && <div className="metric-hint">click for details</div>}
    </div>
  )
}
