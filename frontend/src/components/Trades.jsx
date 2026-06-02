import { useState } from 'react'
import TradesTable from './TradesTable'
import AddTradeForm from './AddTradeForm'

export default function Trades({ trades, onAdd, onDelete, onUpdate }) {
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div>
      <div className="trades-panel-header">
        <div className="trades-title">
          Trade Log
          <span className="trades-count">({trades.length})</span>
        </div>
        <button
          className={`btn ${formOpen ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => setFormOpen(o => !o)}
        >
          {formOpen ? '✕  Cancel' : '+ Add Trade'}
        </button>
      </div>

      <AddTradeForm
        open={formOpen}
        onAdd={onAdd}
        onClose={() => setFormOpen(false)}
      />

      <TradesTable trades={trades} onDelete={onDelete} onUpdate={onUpdate} />
    </div>
  )
}
