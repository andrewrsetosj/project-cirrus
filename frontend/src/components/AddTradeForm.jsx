import { useState } from 'react'
import SymbolInput from './SymbolInput'

const EMPTY = { symbol: '', open_date: '', close_date: '', shares: '', total_buy: '', total_sell: '' }

const FIELDS = [
  { key: 'open_date',  label: 'Open Date',   type: 'date',   placeholder: '' },
  { key: 'close_date', label: 'Close Date',  type: 'date',   placeholder: '' },
  { key: 'shares',     label: 'Shares',      type: 'number', placeholder: '10',      extra: { min: 1, step: 1 } },
  { key: 'total_buy',  label: 'Total Buy $', type: 'number', placeholder: '1500.00', extra: { min: 0.01, step: 0.01 } },
  { key: 'total_sell', label: 'Total Sell $',type: 'number', placeholder: '1750.00', extra: { min: 0.01, step: 0.01 } },
]

export default function AddTradeForm({ open, onAdd, onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    const [oy, om, od] = form.open_date.split('-').map(Number)
    const [cy, cm, cd] = form.close_date.split('-').map(Number)
    if (new Date(cy, cm - 1, cd) < new Date(oy, om - 1, od)) {
      setError('Close date must be on or after open date.')
      return
    }
    const err = await onAdd(form)
    if (err) { setError(err); return }
    setForm(EMPTY)
    onClose()
  }

  return (
    <div className={`add-form-wrap ${open ? 'open' : 'closed'}`}>
      <form className="add-form" onSubmit={handleSubmit}>
        {/* Symbol gets autocomplete */}
        <div className="form-group">
          <label className="form-label">Symbol</label>
          <SymbolInput value={form.symbol} onChange={v => set('symbol', v)} required />
        </div>

        {FIELDS.map(f => (
          <div key={f.key} className="form-group">
            <label className="form-label">{f.label}</label>
            <input
              className="form-input"
              type={f.type}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              required
              {...(f.extra || {})}
            />
          </div>
        ))}

        <div className="form-actions">
          {error && <span className="form-error">{error}</span>}
          {!error && <span style={{ flex: 1 }} />}
          <button type="button" className="btn btn-ghost" onClick={() => { setError(''); onClose() }}>Cancel</button>
          <button type="submit" className="btn btn-primary">Add Trade</button>
        </div>
      </form>
    </div>
  )
}
