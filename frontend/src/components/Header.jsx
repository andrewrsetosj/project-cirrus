export const ACCOUNTS = [
  { key: 'ira',       label: 'IRA' },
  { key: 'brokerage', label: 'BROKERAGE' },
  { key: 'all',       label: 'ALL' },
]

export default function Header({ account, onAccount }) {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">
          <span className="header-glyph">◈</span>
          <span className="header-name">PROJECT CIRRUS</span>
        </div>
        <div className="header-sep" />
        <span className="header-sub">Trading Dashboard</span>
      </div>
      <div className="acct-switch" role="group" aria-label="Account">
        {ACCOUNTS.map(a => (
          <button
            key={a.key}
            className={`acct-btn${account === a.key ? ' active' : ''}`}
            onClick={() => onAccount(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="header-status">
        <span className="status-dot" />
        <span>LOCAL</span>
      </div>
    </header>
  )
}
