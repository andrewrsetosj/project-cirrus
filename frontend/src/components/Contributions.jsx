import { useState } from 'react'
import { fmtDollar } from '../utils/format'

function AddContributionForm({ open, onAdd, onClose }) {
  const [form, setForm] = useState({ date: '', amount: '', note: '' })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const err = await onAdd(form)
    if (err) { setError(err); return }
    setForm({ date: '', amount: '', note: '' })
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
          <input className="form-input" type="number" step="0.01" placeholder="e.g. 6500 or -500" value={form.amount} onChange={e => set('amount', e.target.value)} required />
        </div>
        <div className="form-group">
          <label className="form-label">Note</label>
          <input className="form-input" type="text" placeholder="optional" value={form.note} onChange={e => set('note', e.target.value)} />
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

export default function Contributions({ contributions, onAdd, onDelete }) {
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  let running = 0
  const rows = contributions.map(c => {
    running = Math.round((running + c.amount) * 100) / 100
    return { ...c, running }
  })

  const totalNet = contributions.reduce((s, c) => Math.round((s + c.amount) * 100) / 100, 0)
  const deposits = contributions.filter(c => c.amount > 0).reduce((s, c) => s + c.amount, 0)
  const withdrawals = contributions.filter(c => c.amount < 0).reduce((s, c) => s + c.amount, 0)

  return (
    <div>
      <div className="trades-panel-header">
        <div className="trades-title">
          Contributions
          <span className="trades-count">({contributions.length} entries)</span>
        </div>
        <button
          className={`btn ${formOpen ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => setFormOpen(o => !o)}
        >
          {formOpen ? '✕  Cancel' : '+ Add Entry'}
        </button>
      </div>

      <AddContributionForm open={formOpen} onAdd={onAdd} onClose={() => setFormOpen(false)} />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div className="metric-card">
          <div className="metric-label">Total Deposited</div>
          <div className="metric-value gain" style={{ fontSize: 22 }}>{fmtDollar(deposits)}</div>
          <div className="metric-secondary">gross contributions</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Withdrawn</div>
          <div className="metric-value loss" style={{ fontSize: 22 }}>{fmtDollar(Math.abs(withdrawals))}</div>
          <div className="metric-secondary">overcontributions etc.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Net Contributed</div>
          <div className="metric-value" style={{ fontSize: 22 }}>{fmtDollar(totalNet)}</div>
          <div className="metric-secondary">your true cost basis</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Date</th>
              <th className="r">Amount</th>
              <th className="r">Running Total</th>
              <th>Note</th>
              <th className="no-sort" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}>No contributions yet. Click "+ Add Entry" to get started.</td>
              </tr>
            )}
            {rows.map(c => (
              <tr key={c.id}>
                <td className="cell-r">{c.id}</td>
                <td className="cell-date">{c.date}</td>
                <td className={`cell-r ${c.amount >= 0 ? 'cell-gain' : 'cell-loss'}`}>
                  {c.amount >= 0 ? fmtDollar(c.amount) : `(${fmtDollar(Math.abs(c.amount))})`}
                </td>
                <td className="cell-r num-cell">{fmtDollar(c.running)}</td>
                <td className="cell-muted" style={{ fontSize: 11 }}>{c.note}</td>
                <td style={{ textAlign: 'right' }}>
                  {confirmDel === c.id ? (
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn-del btn-del-armed" onClick={() => { onDelete(c.id); setConfirmDel(null) }}>CONFIRM</button>
                      <button className="btn-del" onClick={() => setConfirmDel(null)}>✕</button>
                    </span>
                  ) : (
                    <button className="btn-del" onClick={() => setConfirmDel(c.id)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
