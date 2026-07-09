export default function MetricCard({ label, value, secondary, variant, onClick }) {
  const cls = ['metric-value', variant === 'gain' ? 'gain' : variant === 'loss' ? 'loss' : ''].join(' ').trim()
  return (
    <div className={`metric-card${onClick ? ' metric-card-clickable' : ''}`} onClick={onClick}>
      <div className="metric-label">{label}</div>
      <div className={cls}>{value}</div>
      {secondary && <div className="metric-secondary">{secondary}</div>}
      {onClick && <div className="metric-hint">click for details</div>}
    </div>
  )
}
