export default function Header() {
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
      <div className="header-status">
        <span className="status-dot" />
        <span>LOCAL</span>
      </div>
    </header>
  )
}
