import React, { useState, useEffect, useCallback } from 'react'
import SymbolInput from './SymbolInput'
import DatePicker from './DatePicker'
import { r2, MIN_DAYS_TO_ANNUALIZE } from '../utils/compute'
import { fmtDollar, fmtPct } from '../utils/format'

// ── helpers ──────────────────────────────────────────────────────────────────

const SHARE_EPS = 1e-8
const r8 = n => Math.round(n * 1e8) / 1e8

const groupKey = p => `${p.symbol}|${p.account ?? 'ira'}`

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysHeld(open_date) {
  const [y, m, d] = open_date.split('-').map(Number)
  return Math.round((Date.now() - new Date(y, m - 1, d)) / 86400000)
}

function enrichPosition(p, prices) {
  const buy_per_sh  = r2(p.total_buy / p.shares)
  const days        = daysHeld(p.open_date)
  const price       = prices[p.symbol] ?? null
  const mkt_value   = price != null ? r2(price * p.shares) : null
  const unr_pl      = price != null ? r2(mkt_value - p.total_buy) : null
  const unr_pct     = price != null && p.total_buy > 0 ? unr_pl / p.total_buy : null
  const cagr        = price != null && days >= MIN_DAYS_TO_ANNUALIZE
    ? Math.pow(price / buy_per_sh, 365 / days) - 1
    : null
  return { ...p, buy_per_sh, days, price, mkt_value, unr_pl, unr_pct, cagr }
}

// Roll one ticker's lots into a single blended row.
//
// Days held is weighted by cost basis rather than averaged flat, which keeps the
// group's CAGR consistent with the per-lot formula: a lot's CAGR is
// (mkt / cost) ^ (365 / days) - 1, and the group applies that same shape to the
// summed totals. A flat average would let a tiny recent lot drag the annualized
// figure as hard as a large old one.
function aggregateGroup(key, lots) {
  const shares    = r8(lots.reduce((s, p) => s + p.shares, 0))
  const total_buy = r2(lots.reduce((s, p) => s + p.total_buy, 0))
  const price     = lots[0].price
  const mkt_value = price != null ? r2(lots.reduce((s, p) => s + p.mkt_value, 0)) : null
  const unr_pl    = mkt_value != null ? r2(mkt_value - total_buy) : null
  const unr_pct   = unr_pl != null && total_buy > 0 ? unr_pl / total_buy : null
  const days      = total_buy > 0
    ? Math.round(lots.reduce((s, p) => s + p.total_buy * p.days, 0) / total_buy)
    : 0
  const cagr = mkt_value != null && total_buy > 0 && days >= MIN_DAYS_TO_ANNUALIZE
    ? Math.pow(mkt_value / total_buy, 365 / days) - 1
    : null

  return {
    key,
    lots,
    symbol:     lots[0].symbol,
    account:    lots[0].account ?? 'ira',
    // lots arrive oldest-first, so the first one is when this holding started
    open_date:  lots[0].open_date,
    shares, total_buy, price, mkt_value, unr_pl, unr_pct, days, cagr,
    buy_per_sh: r2(total_buy / shares),
  }
}

// ── Add Position Form ─────────────────────────────────────────────────────────

function AddPositionForm({ open, onAdd, onClose }) {
  const [form, setForm] = useState({ symbol: '', open_date: todayStr(), shares: '', total_buy: '' })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onAdd(form)
    if (err) { setError(err); return }
    setForm({ symbol: '', open_date: todayStr(), shares: '', total_buy: '' })
    onClose()
  }

  return (
    <div className={`add-form-wrap ${open ? 'open' : 'closed'}`}>
      <form className="add-form" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }} onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Symbol</label>
          <SymbolInput value={form.symbol} onChange={v => set('symbol', v)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Open Date</label>
          <DatePicker value={form.open_date} onChange={v => set('open_date', v)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Shares</label>
          <input className="form-input" type="number" min="0.000001" step="any" placeholder="10" value={form.shares} onChange={e => set('shares', e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Total Cost $</label>
          <input className="form-input" type="number" step="0.01" min="0.01" placeholder="1500.00" value={form.total_buy} onChange={e => set('total_buy', e.target.value)} required />
        </div>
        <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
          {error && <span className="form-error">{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <button type="button" className="btn btn-ghost" onClick={() => { setError(''); onClose() }}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add Position</button>
        </div>
      </form>
    </div>
  )
}

// ── Edit Position inline form ─────────────────────────────────────────────────

const EDIT_POS_FIELDS = [
  { key: 'symbol',    label: 'Symbol',      type: 'text',   width: 80 },
  { key: 'open_date', label: 'Open Date',   type: 'date',   width: 138 },
  { key: 'shares',    label: 'Shares',      type: 'number', width: 76,  extra: { min: 0.000001, step: 'any' } },
  { key: 'total_buy', label: 'Total Cost $', type: 'number', width: 120, extra: { min: 0.01, step: 0.01 } },
]

function EditPositionRow({ position, colSpan, onSave, onCancel }) {
  const [form, setForm] = useState({
    symbol:    position.symbol,
    open_date: position.open_date,
    shares:    String(position.shares),
    total_buy: String(position.total_buy),
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onSave(position.id, form)
    if (err) setError(err)
  }

  return (
    <tr className="edit-form-row">
      <td colSpan={colSpan}>
        <form className="inline-edit-form" onSubmit={handleSubmit}>
          {EDIT_POS_FIELDS.map(f => (
            <div key={f.key} className="edit-form-field">
              <label>{f.label}</label>
              {f.key === 'symbol' ? (
                <div style={{ width: f.width }}>
                  <SymbolInput value={form.symbol} onChange={v => set('symbol', v)} required />
                </div>
              ) : f.key === 'open_date' ? (
                <div style={{ width: f.width }}>
                  <DatePicker value={form.open_date} onChange={v => set('open_date', v)} required />
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

// ── Close Position inline form ────────────────────────────────────────────────

function CloseFormRow({ position, colSpan, onClose, onCancel }) {
  const [closeDate, setCloseDate] = useState(todayStr())
  const [shares, setShares]       = useState(String(position.shares))
  const [totalSell, setTotalSell] = useState('')
  const [error, setError]         = useState('')

  // Share counts are floats, so compare with a tolerance: selling 0.972 out of a
  // position stored as 0.9719999999999995 is a full close, not an overflow.
  const maxShares   = r8(position.shares)
  const sellShares  = parseFloat(shares) || 0
  const isPartial   = sellShares > 0 && maxShares - sellShares > SHARE_EPS
  const remaining   = Math.round((position.shares - sellShares) * 1e6) / 1e6

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (sellShares <= 0 || sellShares - maxShares > SHARE_EPS) {
      setError(`Shares must be between 1 and ${maxShares}`)
      return
    }
    const err = await onClose(position.id, { close_date: closeDate, total_sell: totalSell, shares: sellShares })
    if (err) setError(err)
  }

  return (
    <tr className="close-form-row">
      <td colSpan={colSpan}>
        <form className="inline-close-form" onSubmit={handleSubmit}>
          <span className="close-form-sym">Close <strong>{position.symbol}</strong></span>
          <div className="close-form-field">
            <label>Close Date</label>
            <DatePicker value={closeDate} onChange={setCloseDate} required />
          </div>
          <div className="close-form-field">
            <label>Shares to Sell</label>
            <input
              type="number" step="any" min="0.000001" max={maxShares} className="form-input"
              placeholder={String(maxShares)} value={shares}
              onChange={e => setShares(e.target.value)} required
            />
          </div>
          <div className="close-form-field">
            <label>Total Sell $</label>
            <input type="number" step="0.01" min="0.01" className="form-input" placeholder="0.00" value={totalSell} onChange={e => setTotalSell(e.target.value)} required />
          </div>
          {isPartial && (
            <span style={{ fontSize: 11, color: 'var(--t2)' }}>
              {remaining} sh will remain open
            </span>
          )}
          {error && <span className="form-error">{error}</span>}
          <button type="submit" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 11 }}>
            {isPartial ? 'Confirm Partial Close' : 'Confirm Close'}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }} onClick={onCancel}>Cancel</button>
        </form>
      </td>
    </tr>
  )
}

// ── Sell (multi-lot) inline form ─────────────────────────────────────────────

// Mirrors _allocate_lots() in app.py so the preview matches what the server will
// actually write. Lots come in oldest-first; LIFO just walks them backwards.
function allocateLots(lots, sellShares, totalSell, method) {
  const ordered = method === 'lifo' ? [...lots].reverse() : lots
  const picks = []
  let remaining = sellShares
  for (const lot of ordered) {
    if (remaining <= SHARE_EPS) break
    let take = Math.min(remaining, lot.shares)
    if (lot.shares - take <= SHARE_EPS) take = lot.shares
    take = r8(take)
    picks.push({ lot, take })
    remaining = r8(remaining - take)
  }
  const taken = r8(picks.reduce((s, p) => s + p.take, 0))
  let allocated = 0
  return picks.map(({ lot, take }, idx) => {
    let amount
    if (idx === picks.length - 1) {
      amount = r2(totalSell - allocated)
    } else {
      amount = r2(totalSell * take / taken)
      allocated = r2(allocated + amount)
    }
    return { lot, take, amount }
  })
}

function SellFormRow({ positions, colSpan, onSell, onCancel }) {
  const totalShares = r8(positions.reduce((s, p) => s + p.shares, 0))

  const [closeDate, setCloseDate] = useState(todayStr())
  const [shares,    setShares]    = useState(String(totalShares))
  const [totalSell, setTotalSell] = useState('')
  const [method,    setMethod]    = useState('fifo')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const sellShares = parseFloat(shares) || 0
  const proceeds   = parseFloat(totalSell) || 0
  const valid      = sellShares > 0 && sellShares - totalShares <= SHARE_EPS
  const splits     = valid && proceeds > 0 ? allocateLots(positions, Math.min(sellShares, totalShares), proceeds, method) : []
  const remaining  = r8(totalShares - sellShares)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!valid) {
      setError(`Shares must be between 0 and ${totalShares}`)
      return
    }
    setLoading(true)
    const err = await onSell({
      symbol:     positions[0].symbol,
      account:    positions[0].account ?? 'ira',
      close_date: closeDate,
      shares:     sellShares,
      total_sell: totalSell,
      method,
    })
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <tr className="close-form-row">
      <td colSpan={colSpan}>
        <form className="inline-close-form" onSubmit={handleSubmit}>
          <span className="close-form-sym">Sell <strong>{positions[0].symbol}</strong></span>
          <div className="close-form-field">
            <label>Close Date</label>
            <DatePicker value={closeDate} onChange={setCloseDate} required />
          </div>
          <div className="close-form-field">
            <label>Shares to Sell</label>
            <input
              type="number" step="any" min="0.000001" max={totalShares} className="form-input"
              style={{ width: 96 }} placeholder={String(totalShares)} value={shares}
              onChange={e => setShares(e.target.value)} required
            />
          </div>
          <div className="close-form-field">
            <label>Total Proceeds $</label>
            <input
              type="number" step="0.01" min="0.01" className="form-input"
              placeholder="0.00" value={totalSell}
              onChange={e => setTotalSell(e.target.value)} required
            />
          </div>
          <div className="close-form-field">
            <label>Lot Order</label>
            <select className="form-input" style={{ width: 88 }} value={method} onChange={e => setMethod(e.target.value)}>
              <option value="fifo">FIFO</option>
              <option value="lifo">LIFO</option>
            </select>
          </div>
          {splits.length > 0 && (
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--t2)', alignItems: 'center', flexWrap: 'wrap' }}>
              {splits.map(({ lot, take, amount }) => (
                <span key={lot.id}>
                  #{lot.id} ({take} of {lot.shares} sh): <span style={{ color: 'var(--t1)' }}>{fmtDollar(amount)}</span>
                </span>
              ))}
              {remaining > SHARE_EPS && <span>{remaining} sh will remain open</span>}
            </div>
          )}
          {error && <span className="form-error">{error}</span>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '6px 14px', fontSize: 11 }}>
            {loading ? 'Selling…' : `Confirm Sell (${splits.length || positions.length} lot${(splits.length || positions.length) === 1 ? '' : 's'})`}
          </button>
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }} onClick={onCancel}>Cancel</button>
        </form>
      </td>
    </tr>
  )
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryBar({ positions }) {
  const hasPrices  = positions.some(p => p.price != null)
  const totalCost  = r2(positions.reduce((s, p) => s + p.total_buy, 0))
  const totalMkt   = hasPrices ? r2(positions.reduce((s, p) => s + (p.mkt_value ?? p.total_buy), 0)) : null
  const totalUnr   = totalMkt != null ? r2(totalMkt - totalCost) : null
  const totalUnrPct = totalCost > 0 && totalUnr != null ? totalUnr / totalCost : null

  const cards = [
    { label: 'Open Positions', value: positions.length, secondary: 'active holdings' },
    { label: 'Total Cost Basis', value: fmtDollar(totalCost), secondary: 'amount invested' },
    { label: 'Market Value', value: totalMkt != null ? fmtDollar(totalMkt) : '—', secondary: 'at current prices' },
    {
      label: 'Unrealized P&L',
      value: totalUnr != null ? fmtDollar(totalUnr) : '—',
      secondary: totalUnrPct != null ? fmtPct(totalUnrPct, 2) + ' total return' : 'awaiting prices',
      variant: totalUnr == null ? '' : totalUnr >= 0 ? 'gain' : 'loss',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {cards.map(c => (
        <div key={c.label} className="metric-card">
          <div className="metric-label">{c.label}</div>
          <div className={['metric-value', c.variant || ''].join(' ').trim()}
               style={{ fontSize: 22 }}>
            {c.value}
          </div>
          <div className="metric-secondary">{c.secondary}</div>
        </div>
      ))}
    </div>
  )
}

// ── Per-lot action buttons ───────────────────────────────────────────────────

// Shared by the drilldown lot rows and by a single-lot group row, where the
// group row *is* the lot and so carries lot-level actions itself.
function LotActions({ p, editingId, closingId, confirmDel,
                      setEditingId, setClosingId, setConfirmDel, setSellingKey,
                      handleEdit, handleDelete }) {
  if (editingId === p.id) return <button className="btn-del" onClick={() => setEditingId(null)}>Cancel</button>
  if (closingId === p.id) return <button className="btn-del" onClick={() => setClosingId(null)}>Cancel</button>
  if (confirmDel === p.id) {
    return (
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <button className="btn-del btn-del-armed" onClick={() => handleDelete(p.id)}>CONFIRM</button>
        <button className="btn-del" onClick={() => setConfirmDel(null)}>✕</button>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', gap: 5 }}>
      <button className="btn-del btn-edit" onClick={() => handleEdit(p.id)}>Edit</button>
      <button className="btn-del" style={{ color: '#00c8e1' }}
        onClick={() => { setClosingId(p.id); setEditingId(null); setConfirmDel(null); setSellingKey(null) }}>
        Close
      </button>
      <button className="btn-del" onClick={() => handleDelete(p.id)}>✕</button>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const COLS = 13   // number of visible columns before the action column

export default function Positions({ positions, prices, pricesLoading, onRefreshPrices, onAdd, onDelete, onClose, onSell, onUpdate }) {
  const [formOpen,        setFormOpen]        = useState(false)
  const [closingId,       setClosingId]       = useState(null)
  const [editingId,       setEditingId]       = useState(null)
  const [confirmDel,      setConfirmDel]      = useState(null)
  const [sellingKey,      setSellingKey]      = useState(null)
  const [expanded,        setExpanded]        = useState(() => new Set())

  const enriched = positions.map(p => enrichPosition(p, prices))

  // Group lots by symbol *and* account: in the combined "all" view the same
  // symbol can sit in both accounts, and rolling those into one row (or FIFO
  // matching across them) would be wrong.
  const symbolGroups = new Map()
  enriched.forEach(p => {
    const k = groupKey(p)
    if (!symbolGroups.has(k)) symbolGroups.set(k, [])
    symbolGroups.get(k).push(p)
  })
  // Map preserves insertion order, so groups stay in the API's open_date order
  // and each group's lots stay oldest-first.
  const groups = [...symbolGroups].map(([k, lots]) => aggregateGroup(k, lots))

  const toggle = key => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const handleClose = async (id, data) => {
    const err = await onClose(id, data)
    if (!err) setClosingId(null)
    return err
  }

  const handleSave = async (id, form) => {
    const err = await onUpdate(id, form)
    if (!err) setEditingId(null)
    return err
  }

  const handleDelete = id => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null) }
    else { setConfirmDel(id); setEditingId(null); setClosingId(null) }
  }

  const handleEdit = id => {
    setEditingId(id); setClosingId(null); setConfirmDel(null); setSellingKey(null)
  }

  const handleSell = async data => {
    const err = await onSell(data)
    if (!err) setSellingKey(null)
    return err
  }

  return (
    <div>
      {/* Header */}
      <div className="trades-panel-header">
        <div className="trades-title">
          Positions
          <span className="trades-count">
            ({groups.length} ticker{groups.length === 1 ? '' : 's'}
            {groups.length !== positions.length && <> · {positions.length} lots</>})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={onRefreshPrices} disabled={pricesLoading} style={{ fontSize: 11 }}>
            {pricesLoading ? '↻ Updating…' : '↻ Refresh Prices'}
          </button>
          {onAdd ? (
            <button className={`btn ${formOpen ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setFormOpen(o => !o)}>
              {formOpen ? '✕  Cancel' : '+ Add Position'}
            </button>
          ) : (
            <span className="acct-hint">switch to IRA or Brokerage to add</span>
          )}
        </div>
      </div>

      {/* Add form */}
      <AddPositionForm open={formOpen} onAdd={onAdd} onClose={() => setFormOpen(false)} />

      {/* Summary */}
      {enriched.length > 0 && <SummaryBar positions={enriched} />}

      {/* Table */}
      <div className="table-wrap" onClick={e => { if (!e.target.closest('.btn-del') && !e.target.closest('.close-form-row')) setConfirmDel(null) }}>
        <table>
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Symbol</th>
              <th>Open Date</th>
              <th className="r">Shares</th>
              <th className="r">Cost Basis</th>
              <th className="r">Avg Buy/sh</th>
              <th className="r" style={{ color: '#00c8e1' }}>
                Live Price
                {pricesLoading && <span style={{ marginLeft: 4, opacity: 0.5 }}>…</span>}
              </th>
              <th className="r">Mkt Value</th>
              <th className="r">Unr P&L</th>
              <th className="r">Unr %</th>
              <th className="r">Days Held</th>
              <th className="r">CAGR</th>
              <th className="no-sort" />
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 && (
              <tr className="empty-row">
                <td colSpan={COLS + 1}>No open positions. Click "+ Add Position" to track a holding.</td>
              </tr>
            )}
            {groups.map(g => {
              const isMulti  = g.lots.length > 1
              const open     = isMulti && expanded.has(g.key)
              const lot      = g.lots[0]              // for single-lot groups the row *is* the lot
              const gPlCls   = g.unr_pl == null ? '' : g.unr_pl >= 0 ? 'cell-gain' : 'cell-loss'
              const selling  = sellingKey === g.key
              const busy     = !isMulti && (editingId === lot.id || closingId === lot.id)
              const rowCls   = ['pos-group-row', isMulti ? '' : 'static', open ? 'open' : ''].join(' ').trim()

              return (
                <React.Fragment key={g.key}>
                  <tr
                    className={rowCls}
                    style={{ opacity: selling || busy ? 0.4 : 1 }}
                    onClick={e => { if (isMulti && !e.target.closest('.btn-del')) toggle(g.key) }}
                  >
                    <td className="cell-r">
                      {isMulti ? <span className="pos-disclosure">▶</span> : lot.id}
                    </td>
                    <td className="cell-sym">
                      {g.symbol}
                      {isMulti && <span className="lot-badge">{g.lots.length} LOTS</span>}
                    </td>
                    <td className="cell-date">{g.open_date}</td>
                    <td className="cell-r">{g.shares}</td>
                    <td className="cell-r">{fmtDollar(g.total_buy)}</td>
                    <td className="cell-r">{fmtDollar(g.buy_per_sh)}</td>
                    <td className="cell-r" style={{ color: g.price != null ? '#00c8e1' : '#3d5068' }}>
                      {g.price != null ? fmtDollar(g.price) : '—'}
                    </td>
                    <td className="cell-r">{g.mkt_value != null ? fmtDollar(g.mkt_value) : '—'}</td>
                    <td className={`cell-r ${gPlCls}`}>{g.unr_pl != null ? fmtDollar(g.unr_pl) : '—'}</td>
                    <td className={`cell-r ${gPlCls}`}>{g.unr_pct != null ? fmtPct(g.unr_pct) : '—'}</td>
                    <td className="cell-r cell-muted">{g.days}</td>
                    <td className="cell-r cell-muted">{g.cagr != null ? fmtPct(g.cagr, 1) : '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {selling ? (
                        <button className="btn-del" onClick={() => setSellingKey(null)}>Cancel</button>
                      ) : isMulti ? (
                        <button className="btn-del" style={{ color: '#00c8e1' }}
                          onClick={() => { setSellingKey(g.key); setClosingId(null); setEditingId(null); setConfirmDel(null) }}>
                          Sell
                        </button>
                      ) : (
                        <LotActions
                          p={lot}
                          editingId={editingId} closingId={closingId} confirmDel={confirmDel}
                          setEditingId={setEditingId} setClosingId={setClosingId}
                          setConfirmDel={setConfirmDel} setSellingKey={setSellingKey}
                          handleEdit={handleEdit} handleDelete={handleDelete}
                        />
                      )}
                    </td>
                  </tr>

                  {/* Selling the whole ticker: the form spans every lot in the group */}
                  {selling && (
                    <SellFormRow
                      positions={g.lots}
                      colSpan={COLS + 1}
                      onSell={handleSell}
                      onCancel={() => setSellingKey(null)}
                    />
                  )}

                  {/* Single-lot group: the group row is the lot, so its forms hang off it directly */}
                  {!isMulti && editingId === lot.id && (
                    <EditPositionRow position={lot} colSpan={COLS + 1}
                      onSave={handleSave} onCancel={() => setEditingId(null)} />
                  )}
                  {!isMulti && closingId === lot.id && (
                    <CloseFormRow position={lot} colSpan={COLS + 1}
                      onClose={handleClose} onCancel={() => setClosingId(null)} />
                  )}

                  {/* Drilldown: the individual lots behind the rollup */}
                  {open && g.lots.map(p => {
                    const plCls  = p.unr_pl == null ? '' : p.unr_pl >= 0 ? 'cell-gain' : 'cell-loss'
                    const dimmed = editingId === p.id || closingId === p.id
                    return (
                      <React.Fragment key={p.id}>
                        <tr className="pos-lot-row" style={{ opacity: dimmed ? 0.4 : 1 }}>
                          <td className="cell-r cell-muted">{p.id}</td>
                          <td className="lot-marker">└ lot</td>
                          <td className="cell-date">{p.open_date}</td>
                          <td className="cell-r">{p.shares}</td>
                          <td className="cell-r">{fmtDollar(p.total_buy)}</td>
                          <td className="cell-r">{fmtDollar(p.buy_per_sh)}</td>
                          <td className="cell-r cell-muted">{p.price != null ? fmtDollar(p.price) : '—'}</td>
                          <td className="cell-r">{p.mkt_value != null ? fmtDollar(p.mkt_value) : '—'}</td>
                          <td className={`cell-r ${plCls}`}>{p.unr_pl != null ? fmtDollar(p.unr_pl) : '—'}</td>
                          <td className={`cell-r ${plCls}`}>{p.unr_pct != null ? fmtPct(p.unr_pct) : '—'}</td>
                          <td className="cell-r cell-muted">{p.days}</td>
                          <td className="cell-r cell-muted">{p.cagr != null ? fmtPct(p.cagr, 1) : '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <LotActions
                              p={p}
                              editingId={editingId} closingId={closingId} confirmDel={confirmDel}
                              setEditingId={setEditingId} setClosingId={setClosingId}
                              setConfirmDel={setConfirmDel} setSellingKey={setSellingKey}
                              handleEdit={handleEdit} handleDelete={handleDelete}
                            />
                          </td>
                        </tr>
                        {editingId === p.id && (
                          <EditPositionRow position={p} colSpan={COLS + 1}
                            onSave={handleSave} onCancel={() => setEditingId(null)} />
                        )}
                        {closingId === p.id && (
                          <CloseFormRow position={p} colSpan={COLS + 1}
                            onClose={handleClose} onCancel={() => setClosingId(null)} />
                        )}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
