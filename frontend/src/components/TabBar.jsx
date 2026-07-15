const TABS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: '▣', accent: 'var(--cyan)' },
  { key: 'trades',        label: 'Trades',        icon: '▤', accent: 'var(--violet)' },
  { key: 'positions',     label: 'Positions',     icon: '◉', accent: 'var(--green)' },
  { key: 'contributions', label: 'Contributions', icon: '⊕', accent: 'var(--amber)' },
  { key: 'research',      label: 'Research',      icon: '◈', accent: 'var(--mag)' },
  { key: 'checkpoint',    label: 'Checkpoint',    icon: '⊙', accent: 'var(--cyan)' },
]

export default function TabBar({ tab, onTab, positionCount, checkpointCount }) {
  return (
    <nav className="tab-nav">
      {TABS.map(t => (
        <button
          key={t.key}
          className={`tab-btn${tab === t.key ? ' active' : ''}`}
          style={{ '--tac': t.accent }}
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
