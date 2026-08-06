import React, { useState } from 'react'
import { fmtDollar } from '../utils/format'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function AddIncomeForm({ open, onAdd, onClose }) {
  const [form, setForm] = useState({ date: todayStr(), amount: '', note: '' })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onAdd(form)
    if (err) { setError(err); return }
    setForm({ date: todayStr(), amount: '', note: '' })
    onClose()
  }

  return (
    <div className={`add-form-wrap ${open ? 'open' : 'closed'}`}>
      <form className="add-form" style={{ gridTemplateColumns: '160px 160px 1fr' }} onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Amount $</label>
          <input className="form-input" type="number" step="0.01" placeholder="e.g. 2.31" value={form.amount} onChange={e => set('amount', e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" type="text" placeholder="e.g. Dell dividend" value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
          {error && <span className="form-error">{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <button type="button" className="btn btn-ghost" onClick={() => { setError(''); onClose() }}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add</button>
        </div>
      </form>
    </div>
  )
}

const EDIT_FIELDS = [
  { key: 'date',   label: 'Date',        type: 'date',   width: 138 },
  { key: 'amount', label: 'Amount $',    type: 'number', width: 110, extra: { step: 0.01 } },
  { key: 'note',   label: 'Description', type: 'text',   width: 220 },
]

function EditIncomeRow({ entry, colSpan, onSave, onCancel }) {
  const [form, setForm] = useState({ date: entry.date, amount: String(entry.amount), note: entry.note })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onSave(entry.id, form)
    if (err) setError(err)
  }

  return (
    <tr className="edit-form-row">
      <td colSpan={colSpan}>
        <form className="inline-edit-form" onSubmit={handleSubmit}>
          {EDIT_FIELDS.map(f => (
            <div key={f.key} className="edit-form-field">
              <label>{f.label}</label>
              <input
                type={f.type}
                className="form-input"
                style={{ width: f.width }}
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                required={f.key !== 'note'}
                {...(f.extra || {})}
              />
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

export default function Income({ incomeLogs, onAdd, onUpdate, onDelete }) {
  const [formOpen,   setFormOpen]   = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const sorted = [...incomeLogs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  let running = 0
  const rows = sorted.map(e => {
    running = Math.round((running + e.amount) * 100) / 100
    return { ...e, running }
  })

  const totalIncome = rows.length ? rows[rows.length - 1].running : 0

  const handleSave = async (id, form) => {
    const err = await onUpdate(id, form)
    if (!err) setEditingId(null)
    return err
  }

  const handleDelete = id => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null) }
    else { setConfirmDel(id); setEditingId(null) }
  }

  return (
    <div>
      <div className="trades-panel-header">
        <div className="trades-title">
          Income
          <span className="trades-count">({incomeLogs.length} entries)</span>
        </div>
        {onAdd ? (
          <button
            className={`btn ${formOpen ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setFormOpen(o => !o)}
          >
            {formOpen ? '✕  Cancel' : '+ Add Entry'}
          </button>
        ) : (
          <span className="acct-hint">switch to IRA or Brokerage to add</span>
        )}
      </div>

      <AddIncomeForm open={formOpen} onAdd={onAdd} onClose={() => setFormOpen(false)} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 12, marginBottom: 16, maxWidth: 260 }}>
        <div className="metric-card">
          <div className="metric-label">Total Income</div>
          <div className="metric-value gain" style={{ fontSize: 22 }}>{fmtDollar(totalIncome)}</div>
          <div className="metric-secondary">dividends &amp; interest, all entries summed</div>
        </div>
      </div>

      <div className="table-wrap" onClick={e => { if (!e.target.closest('.btn-del')) setConfirmDel(null) }}>
        <table>
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Date</th>
              <th className="r">Amount</th>
              <th className="r">Running Total</th>
              <th>Description</th>
              <th className="no-sort" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}>No entries yet. Click "+ Add Entry" to log your first dividend or interest payment.</td>
              </tr>
            )}
            {rows.map(e => (
              <React.Fragment key={e.id}>
                <tr style={{ opacity: editingId === e.id ? 0.4 : 1 }}>
                  <td className="cell-r">{e.id}</td>
                  <td className="cell-date">{e.date}</td>
                  <td className="cell-r cell-gain">{fmtDollar(e.amount)}</td>
                  <td className="cell-r num-cell">{fmtDollar(e.running)}</td>
                  <td className="cell-muted" style={{ fontSize: 11 }}>{e.note || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editingId === e.id ? (
                      <button className="btn-del" onClick={() => setEditingId(null)}>Cancel</button>
                    ) : confirmDel === e.id ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button className="btn-del btn-del-armed" onClick={() => handleDelete(e.id)}>CONFIRM</button>
                        <button className="btn-del" onClick={() => setConfirmDel(null)}>✕</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 5 }}>
                        <button className="btn-del btn-edit" onClick={() => { setEditingId(e.id); setConfirmDel(null) }}>Edit</button>
                        <button className="btn-del" onClick={() => handleDelete(e.id)}>✕</button>
                      </span>
                    )}
                  </td>
                </tr>
                {editingId === e.id && (
                  <EditIncomeRow
                    entry={e}
                    colSpan={6}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
