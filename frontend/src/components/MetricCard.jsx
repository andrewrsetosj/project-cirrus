export default function MetricCard({ label, value, secondary, variant }) {
  const cls = ['metric-value', variant === 'gain' ? 'gain' : variant === 'loss' ? 'loss' : ''].join(' ').trim()
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={cls}>{value}</div>
      {secondary && <div className="metric-secondary">{secondary}</div>}
    </div>
  )
}
