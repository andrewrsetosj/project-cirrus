import { useState } from 'react'
import { fmtDollar, fmtPct } from '../utils/format'
import SymbolInput from './SymbolInput'

const COLS = [
  { key: 'id',             label: '#',           r: true,  cell: t => t.id },
  { key: 'symbol',         label: 'Symbol',       r: false, cell: t => t.symbol,           cls: 'cell-sym' },
  { key: 'category',       label: 'Type',         r: false, cell: t => t.category,          cls: 'cell-muted cell-cat' },
  { key: 'open_date',      label: 'Open',         r: false, cell: t => t.open_date,         cls: 'cell-date' },
  { key: 'close_date',     label: 'Close',        r: false, cell: t => t.close_date,        cls: 'cell-date' },
  { key: 'shares',         label: 'Shares',       r: true,  cell: t => t.shares },
  { key: 'buy_price',      label: 'Buy/sh',       r: true,  cell: t => fmtDollar(t.buy_price) },
  { key: 'sell_price',     label: 'Sell/sh',      r: true,  cell: t => fmtDollar(t.sell_price) },
  { key: 'gain_per_sh',    label: 'Gain/sh',      r: true,  cell: t => fmtDollar(t.gain_per_sh), color: t => t.gain_per_sh >= 0 ? 'cell-gain' : 'cell-loss' },
  { key: 'total_buy',      label: 'Total Buy',    r: true,  cell: t => fmtDollar(t.total_buy) },
  { key: 'total_sell',     label: 'Total Sell',   r: true,  cell: t => fmtDollar(t.total_sell) },
  { key: 'net',            label: 'Net P&L',      r: true,  cell: t => fmtDollar(t.net),         color: t => t.net >= 0 ? 'cell-gain' : 'cell-loss' },
  { key: 'days_held',      label: 'Days',         r: true,  cell: t => t.days_held },
  { key: 'performance',    label: 'Perf %',       r: true,  cell: t => fmtPct(t.performance),    color: t => t.net >= 0 ? 'cell-gain' : 'cell-loss' },
  { key: 'cagr',           label: 'CAGR',         r: true,  cell: t => fmtPct(t.cagr),           cls: 'cell-muted' },
  { key: 'day_pct_change', label: 'Day %',        r: true,  cell: t => fmtPct(t.day_pct_change), cls: 'cell-muted' },
]

const EDIT_FIELDS = [
  { key: 'symbol',     label: 'Symbol',      type: 'text',   width: 80 },
  { key: 'open_date',  label: 'Open Date',   type: 'date',   width: 138 },
  { key: 'close_date', label: 'Close Date',  type: 'date',   width: 138 },
  { key: 'shares',     label: 'Shares',      type: 'number', width: 76,  extra: { min: 1, step: 1 } },
  { key: 'total_buy',  label: 'Total Buy $', type: 'number', width: 110, extra: { min: 0.01, step: 0.01 } },
  { key: 'total_sell', label: 'Total Sell $',type: 'number', width: 110, extra: { min: 0.01, step: 0.01 } },
]

function EditTradeRow({ trade, colSpan, onSave, onCancel }) {
  const [form, setForm] = useState({
    symbol:     trade.symbol,
    open_date:  trade.open_date,
    close_date: trade.close_date,
    shares:     String(trade.shares),
    total_buy:  String(trade.total_buy),
    total_sell: String(trade.total_sell),
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onSave(trade.id, form)
    if (err) setError(err)
  }

  return (
    <tr className="edit-form-row">
      <td colSpan={colSpan}>
        <form className="inline-edit-form" onSubmit={handleSubmit}>
          {EDIT_FIELDS.map(f => (
            <div key={f.key} className="edit-form-field">
              <label>{f.label}</label>
              {f.key === 'symbol' ? (
                <div style={{ width: f.width }}>
                  <SymbolInput value={form.symbol} onChange={v => set('symbol', v)} required />
                </div>
              ) : (
                <input
                  type={f.type}
                  className="form-input"
                  style={{ width: f.width }}
                  value={form[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  required
                  {...(f.extra || {})}
                />
              )}
            </div>
          ))}
          {error && <span className="form-error">{error}</span>}
          <button type="submit" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 11 }}>Save</button>
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }} onClick={onCancel}>Cancel</button>
        </form>
      </td>
    </tr>
  )
}

function sortTrades(trades, col, dir) {
  const m = dir === 'asc' ? 1 : -1
  return [...trades].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return av < bv ? -m : av > bv ? m : 0
  })
}

export default function TradesTable({ trades, onDelete, onUpdate }) {
  const [sortCol,   setSortCol]   = useState('id')
  const [sortDir,   setSortDir]   = useState('asc')
  const [confirmId, setConfirmId] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const clearActions = () => { setConfirmId(null); setEditingId(null) }

  const handleSort = key => {
    if (key === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  const handleDelete = id => {
    if (confirmId === id) { onDelete(id); setConfirmId(null) }
    else { setConfirmId(id); setEditingId(null) }
  }

  const handleEdit = id => {
    setEditingId(id)
    setConfirmId(null)
  }

  const handleSave = async (id, form) => {
    const err = await onUpdate(id, form)
    if (!err) setEditingId(null)
    return err
  }

  const sorted = sortTrades(trades, sortCol, sortDir)

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLS.map(c => (
              <th
                key={c.key}
                className={[c.r ? 'r' : '', c.key === sortCol ? 'sorted' : ''].join(' ').trim()}
                onClick={() => handleSort(c.key)}
                dangerouslySetInnerHTML={{
                  __html: c.label + `<span class="sort-indicator">${c.key === sortCol ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</span>`
                }}
              />
            ))}
            <th className="no-sort r" style={{ width: 100 }} />
          </tr>
        </thead>
        <tbody onClick={e => {
          if (!e.target.closest('.btn-del') && !e.target.closest('.edit-form-row')) clearActions()
        }}>
          {sorted.length === 0 && (
            <tr className="empty-row"><td colSpan={COLS.length + 1}>No trades found.</td></tr>
          )}
          {sorted.map(t => (
            <>
              <tr key={t.id} style={{ opacity: editingId === t.id ? 0.45 : 1 }}>
                {COLS.map(c => {
                  const colorCls = c.color ? c.color(t) : ''
                  const cls = [c.r ? 'cell-r' : '', c.cls || '', colorCls].filter(Boolean).join(' ')
                  return <td key={c.key} className={cls || undefined}>{c.cell(t)}</td>
                })}
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editingId === t.id ? (
                    <button className="btn-del" onClick={() => setEditingId(null)}>Cancel</button>
                  ) : confirmId === t.id ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn-del btn-del-armed" onClick={() => handleDelete(t.id)}>CONFIRM</button>
                      <button className="btn-del" onClick={() => setConfirmId(null)}>✕</button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn-del btn-edit" onClick={() => handleEdit(t.id)}>Edit</button>
                      <button className="btn-del" onClick={() => handleDelete(t.id)}>✕</button>
                    </span>
                  )}
                </td>
              </tr>
              {editingId === t.id && (
                <EditTradeRow
                  key={`edit-${t.id}`}
                  trade={t}
                  colSpan={COLS.length + 1}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
