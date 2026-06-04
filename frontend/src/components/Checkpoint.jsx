import { useState, useEffect, useRef } from 'react'

const REFRESH = 30

function fmtPrice(n) {
  if (n == null) return '—'
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function fmtPct(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

function fmtChg(n) {
  if (n == null) return '—'
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function elapsed(isoStr) {
  const ms = Date.now() - new Date(isoStr).getTime()
  const mins  = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days  = Math.floor(ms / 86400000)
  if (days  >= 1) return `${days}d ago`
  if (hours >= 1) return `${hours}h ago`
  return `${mins}m ago`
}

function fmtDate(isoStr) {
  return new Date(isoStr).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function CheckpointTab({ checkpoints, onDelete }) {
  const [prices,    setPrices]    = useState({})
  const [loading,   setLoading]   = useState(false)
  const [countdown, setCountdown] = useState(REFRESH)
  const fetchingRef = useRef(false)

  useEffect(() => {
    const symbols = [...new Set(checkpoints.map(c => c.symbol))]
    if (!symbols.length) { setPrices({}); return }

    const fetchPrices = async () => {
      if (fetchingRef.current) return
      fetchingRef.current = true
      setLoading(true)
      try {
        const res = await fetch(`/market/prices?symbols=${symbols.join(',')}`)
        if (res.ok) setPrices(await res.json())
        setCountdown(REFRESH)
      } catch {}
      setLoading(false)
      fetchingRef.current = false
    }

    fetchPrices()
    const rid = setInterval(fetchPrices, REFRESH * 1000)
    const cid = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => { clearInterval(rid); clearInterval(cid) }
  }, [checkpoints])

  if (!checkpoints.length) {
    return (
      <div>
        <div className="trades-panel-header">
          <div className="trades-title">Checkpoint <span className="trades-count">(0 stocks)</span></div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t3)', fontSize: 13 }}>
          No checkpoints yet — hit ⊕ on any stock in the Research tab to start tracking it.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="trades-panel-header">
        <div className="trades-title">
          Checkpoint
          <span className="trades-count">({checkpoints.length} stock{checkpoints.length !== 1 ? 's' : ''})</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
          {loading ? 'Updating…' : `Refreshes in ${countdown}s`}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Checkpointed</th>
              <th className="r">Entry</th>
              <th className="r">Current</th>
              <th className="r">Chg $</th>
              <th className="r">Chg %</th>
              <th className="r">Since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {checkpoints.map(cp => {
              const cur     = prices[cp.symbol]?.price
              const chgAmt  = cur != null ? cur - cp.price : null
              const chgPct  = cur != null ? (cur - cp.price) / cp.price * 100 : null
              const gainCls = chgPct == null ? '' : chgPct >= 0 ? 'cell-gain' : 'cell-loss'
              return (
                <tr key={cp.id}>
                  <td className="cell-sym">{cp.symbol}</td>
                  <td style={{ color: 'var(--t2)', fontSize: 12 }}>{cp.name}</td>
                  <td className="cell-date">{fmtDate(cp.checkpointed_at)}</td>
                  <td className="cell-r" style={{ color: 'var(--t2)' }}>{fmtPrice(cp.price)}</td>
                  <td className="cell-r" style={{ color: 'var(--cyan)' }}>{loading && cur == null ? '…' : fmtPrice(cur)}</td>
                  <td className={`cell-r ${gainCls}`}>{fmtChg(chgAmt)}</td>
                  <td className={`cell-r ${gainCls}`}>{fmtPct(chgPct)}</td>
                  <td className="cell-r cell-date">{elapsed(cp.checkpointed_at)}</td>
                  <td>
                    <button className="btn-del" onClick={() => onDelete(cp.id)}>Remove</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
