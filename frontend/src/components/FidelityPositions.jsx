import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { fmtDollar } from '../utils/format'

export default function FidelityPositions() {
  const [linkToken, setLinkToken] = useState(null)
  const [connected, setConnected] = useState(false)
  const [holdings,  setHoldings]  = useState(null)
  const [balance,   setBalance]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, hRes] = await Promise.all([
        fetch('/plaid/balance'),
        fetch('/plaid/holdings'),
      ])
      const b = await bRes.json()
      const h = await hRes.json()
      if (!b.error) setBalance(b)
      if (!h.error) setHoldings(h)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/plaid/status')
      .then(r => r.json())
      .then(d => { setConnected(d.connected); if (d.connected) fetchData() })
      .catch(() => {})
  }, [fetchData])

  const getLinkToken = async () => {
    setError(null)
    const res = await fetch('/plaid/link-token', { method: 'POST' })
    const d   = await res.json()
    if (d.error) { setError(d.error); return }
    setLinkToken(d.link_token)
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token) => {
      const res = await fetch('/plaid/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      })
      const d = await res.json()
      if (d.ok) { setConnected(true); fetchData() }
      else setError(d.error)
    },
  })

  useEffect(() => { if (linkToken && ready) open() }, [linkToken, ready, open])

  const totalValue = balance?.reduce((s, a) => s + (a.balance || 0), 0) ?? null
  const totalCost  = holdings?.reduce((s, h) => s + (h.cost || 0), 0) ?? null
  const totalGL    = totalValue != null && totalCost != null ? totalValue - totalCost : null

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="trades-panel-header">
        <div className="trades-title">
          Fidelity IRA
          {connected && <span className="trades-count" style={{ color: 'var(--green)' }}>● connected</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {connected && (
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={fetchData} disabled={loading}>
              {loading ? '↻ Loading…' : '↻ Refresh'}
            </button>
          )}
          {!connected && (
            <button className="btn btn-primary" onClick={getLinkToken}>
              Connect Fidelity
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 12, margin: '8px 0' }}>{error}</div>}

      {connected && !loading && !holdings && (
        <div style={{ color: 'var(--t3)', fontSize: 12, padding: '12px 0' }}>Loading account data…</div>
      )}

      {connected && holdings && (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '12px 0 16px' }}>
            <div className="metric-card">
              <div className="metric-label">Account Value</div>
              <div className="metric-value" style={{ fontSize: 22 }}>{fmtDollar(totalValue)}</div>
              <div className="metric-secondary">current market value</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Cost Basis</div>
              <div className="metric-value" style={{ fontSize: 22 }}>{totalCost != null ? fmtDollar(totalCost) : '—'}</div>
              <div className="metric-secondary">total amount invested</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Gain / Loss</div>
              <div className={`metric-value ${totalGL == null ? '' : totalGL >= 0 ? 'gain' : 'loss'}`} style={{ fontSize: 22 }}>
                {totalGL != null ? fmtDollar(totalGL) : '—'}
              </div>
              <div className="metric-secondary">
                {totalGL != null && totalCost ? `${((totalGL / totalCost) * 100).toFixed(2)}% total return` : ''}
              </div>
            </div>
          </div>

          {/* Holdings table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th className="r">Shares</th>
                  <th className="r">Market Value</th>
                  <th className="r">Cost Basis</th>
                  <th className="r">Gain / Loss</th>
                  <th className="r">Return</th>
                </tr>
              </thead>
              <tbody>
                {holdings.length === 0 && (
                  <tr className="empty-row"><td colSpan={7}>No holdings found.</td></tr>
                )}
                {holdings.map((h, i) => {
                  const gl  = h.cost != null ? h.value - h.cost : null
                  const ret = h.cost != null && h.cost > 0 ? (h.value - h.cost) / h.cost : null
                  return (
                    <tr key={i}>
                      <td className="sym-cell">{h.ticker || '—'}</td>
                      <td className="res-name" style={{ maxWidth: 200 }}>{h.name}</td>
                      <td className="cell-r cell-muted">{h.quantity?.toFixed(3)}</td>
                      <td className="cell-r" style={{ color: 'var(--cyan)' }}>{fmtDollar(h.value)}</td>
                      <td className="cell-r cell-muted">{h.cost != null ? fmtDollar(h.cost) : '—'}</td>
                      <td className={`cell-r ${gl == null ? '' : gl >= 0 ? 'cell-gain' : 'cell-loss'}`}>
                        {gl != null ? fmtDollar(gl) : '—'}
                      </td>
                      <td className={`cell-r ${ret == null ? '' : ret >= 0 ? 'cell-gain' : 'cell-loss'}`}>
                        {ret != null ? `${(ret * 100).toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
