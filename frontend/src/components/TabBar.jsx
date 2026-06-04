const TABS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: '▣' },
  { key: 'trades',        label: 'Trades',        icon: '▤' },
  { key: 'positions',     label: 'Positions',     icon: '◉' },
  { key: 'contributions', label: 'Contributions', icon: '⊕' },
  { key: 'research',      label: 'Research',      icon: '◈' },
  { key: 'checkpoint',    label: 'Checkpoint',    icon: '⊙' },
]

export default function TabBar({ tab, onTab, positionCount, checkpointCount }) {
  return (
    <nav className="tab-nav">
      {TABS.map(t => (
        <button
          key={t.key}
          className={`tab-btn${tab === t.key ? ' active' : ''}`}
          onClick={() => onTab(t.key)}
        >
          <span className="tab-icon">{t.icon}</span>
          {t.label}
          {t.key === 'positions'  && positionCount  > 0 && <span className="tab-badge">{positionCount}</span>}
          {t.key === 'checkpoint' && checkpointCount > 0 && <span className="tab-badge">{checkpointCount}</span>}
        </button>
      ))}
    </nav>
  )
}
