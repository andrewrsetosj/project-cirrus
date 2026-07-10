import { useState, useCallback } from 'react'
import TradesTable from './TradesTable'
import AddTradeForm from './AddTradeForm'
import { fmtDollar } from '../utils/format'

// ── Match Plaid sells to open positions ───────────────────────────────────────

function matchSells(sells, positions) {
  const posMap = {}
  positions.forEach(p => {
    if (!posMap[p.symbol]) posMap[p.symbol] = []
    posMap[p.symbol].push({ ...p })
  })
  Object.values(posMap).forEach(arr => arr.sort((a, b) => a.open_date.localeCompare(b.open_date)))

  const used = new Set()
  return sells.map(sell => {
    const candidates = (posMap[sell.ticker] || []).filter(p => !used.has(p.id))
    const exact = candidates.find(p => p.shares === Math.round(sell.quantity))
    const match = exact || candidates[0] || null
    if (match) used.add(match.id)
    return { ...sell, matchedPosition: match }
  })
}

// ── Sync Panel ────────────────────────────────────────────────────────────────

function SyncPanel({ positions, onClosePosition, onDone }) {
  const [status,   setStatus]   = useState('idle')  // idle | loading | ready | importing | done
  const [rows,     setRows]     = useState([])
  const [checked,  setChecked]  = useState(new Set())
  const [error,    setError]    = useState('')
  const [imported, setImported] = useState(0)

  const load = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res  = await fetch('/plaid/investment-transactions')
      const data = await res.json()
      if (data.error) { setError(data.error); setStatus('idle'); return }

      const sells   = data.filter(t => t.type === 'sell')
      const matched = matchSells(sells, positions)

      // Default-check rows that have a matched position
      const defaultChecked = new Set(
        matched.filter(r => r.matchedPosition).map(r => r.id)
      )
      setRows(matched)
      setChecked(defaultChecked)
      setStatus('ready')
    } catch (e) {
      setError('Failed to fetch transactions.')
      setStatus('idle')
    }
  }, [positions])

  const toggle = id => setChecked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleImport = async () => {
    setStatus('importing')
    setError('')
    const toImport = rows.filter(r => checked.has(r.id) && r.matchedPosition)
    let count = 0
    for (const row of toImport) {
      const err = await onClosePosition(row.matchedPosition.id, {
        close_date: row.date,
        total_sell: String(row.amount),
      })
      if (err) { setError(err); setStatus('ready'); return }
      count++
    }
    setImported(count)
    setStatus('done')
  }

  if (status === 'idle') return (
    <div style={{ padding: '14px 0 6px' }}>
      <button className="btn btn-primary" onClick={load}>Fetch from Fidelity</button>
      {error && <span className="form-error" style={{ marginLeft: 12 }}>{error}</span>}
    </div>
  )

  if (status === 'loading') return (
    <div style={{ padding: '14px 0', color: 'var(--t2)', fontSize: 13 }}>Fetching transactions from Plaid…</div>
  )

  if (status === 'done') return (
    <div style={{ padding: '14px 0', color: 'var(--green)', fontSize: 13 }}>
      ✓ Imported {imported} trade{imported !== 1 ? 's' : ''} successfully.
      <button className="btn btn-ghost" style={{ marginLeft: 12, fontSize: 11 }} onClick={onDone}>Close</button>
    </div>
  )

  const matchedRows   = rows.filter(r => r.matchedPosition)
  const unmatchedRows = rows.filter(r => !r.matchedPosition)
  const checkedCount  = rows.filter(r => checked.has(r.id) && r.matchedPosition).length

  return (
    <div style={{ marginBottom: 20 }}>
      {matchedRows.length === 0 && unmatchedRows.length === 0 && (
        <div style={{ color: 'var(--t2)', fontSize: 13, padding: '10px 0' }}>No sell transactions found.</div>
      )}

      {matchedRows.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
            {matchedRows.length} sell transaction{matchedRows.length !== 1 ? 's' : ''} matched to open positions.
            Check the ones you want to import.
          </div>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>Symbol</th>
                  <th>Sell Date</th>
                  <th className="r">Shares</th>
                  <th className="r">Proceeds</th>
                  <th>Matched Position</th>
                  <th>Open Date</th>
                </tr>
              </thead>
              <tbody>
                {matchedRows.map(r => (
                  <tr key={r.id} style={{ opacity: checked.has(r.id) ? 1 : 0.45 }}>
                    <td>
                      <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="cell-sym">{r.ticker}</td>
                    <td className="cell-date">{r.date}</td>
                    <td className="cell-r">{Math.round(r.quantity)}</td>
                    <td className="cell-r cell-gain">{fmtDollar(r.amount)}</td>
                    <td style={{ fontSize: 11, color: 'var(--t2)' }}>#{r.matchedPosition.id} · {r.matchedPosition.shares} sh</td>
                    <td className="cell-date">{r.matchedPosition.open_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              disabled={checkedCount === 0 || status === 'importing'}
              onClick={handleImport}
            >
              {status === 'importing' ? 'Importing…' : `Import ${checkedCount} trade${checkedCount !== 1 ? 's' : ''}`}
            </button>
            <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
            {error && <span className="form-error">{error}</span>}
          </div>
        </>
      )}

      {unmatchedRows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>
            {unmatchedRows.length} sell{unmatchedRows.length !== 1 ? 's' : ''} with no matching open position
            (already closed or not tracked in Cirrus):
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Sell Date</th>
                  <th className="r">Shares</th>
                  <th className="r">Proceeds</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedRows.map(r => (
                  <tr key={r.id} style={{ opacity: 0.45 }}>
                    <td className="cell-sym">{r.ticker}</td>
                    <td className="cell-date">{r.date}</td>
                    <td className="cell-r">{Math.round(r.quantity)}</td>
                    <td className="cell-r">{fmtDollar(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Trades page ───────────────────────────────────────────────────────────────

export default function Trades({ trades, onAdd, onDelete, onUpdate, positions, onClosePosition }) {
  const [formOpen,  setFormOpen]  = useState(false)
  const [syncOpen,  setSyncOpen]  = useState(false)

  return (
    <div>
      <div className="trades-panel-header">
        <div className="trades-title">
          Trade Log
          <span className="trades-count">({trades.length})</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => { setSyncOpen(o => !o); setFormOpen(false) }}
          >
            {syncOpen ? '✕  Cancel Sync' : '↓ Sync from Fidelity'}
          </button>
          <button
            className={`btn ${formOpen ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => { setFormOpen(o => !o); setSyncOpen(false) }}
          >
            {formOpen ? '✕  Cancel' : '+ Add Trade'}
          </button>
        </div>
      </div>

      {syncOpen && (
        <SyncPanel
          positions={positions}
          onClosePosition={onClosePosition}
          onDone={() => setSyncOpen(false)}
        />
      )}

      <AddTradeForm
        open={formOpen}
        onAdd={onAdd}
        onClose={() => setFormOpen(false)}
      />

      <TradesTable trades={trades} onDelete={onDelete} onUpdate={onUpdate} />
    </div>
  )
}
