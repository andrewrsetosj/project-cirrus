import { useEffect } from 'react'

export default function MetricModal({ title, value, variant, children, onClose }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const valCls = ['mm-value', variant === 'gain' ? 'gain' : variant === 'loss' ? 'loss' : ''].join(' ').trim()

  return (
    <div className="mm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mm-panel">
        <div className="mm-header">
          <div>
            <div className="mm-label">{title}</div>
            <div className={valCls}>{value}</div>
          </div>
          <button className="mm-close" onClick={onClose}>✕</button>
        </div>
        <div className="mm-body">{children}</div>
      </div>
    </div>
  )
}
