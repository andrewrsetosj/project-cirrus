import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW    = ['Su','Mo','Tu','We','Th','Fr','Sa']

const CAL_HEIGHT = 300  // rough dropdown height, for the flip-above check

function todayIso() { return new Date().toISOString().slice(0, 10) }

function parseIso(iso) {
  if (!iso) return new Date()
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIso(year, month, day) {
  return `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export default function DatePicker({ value, onChange, required }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState(null)
  const [view, setView] = useState(() => {
    const d = parseIso(value)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const ref    = useRef()
  const calRef = useRef()

  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (!ref.current?.contains(e.target) && !calRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // the calendar is fixed-positioned, so close it if the page moves under it
  useEffect(() => {
    if (!open) return
    const close = e => { if (!calRef.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  useEffect(() => {
    if (value) {
      const d = parseIso(value)
      setView({ year: d.getFullYear(), month: d.getMonth() })
    }
  }, [value])

  const toggle = () => {
    if (!open) {
      const r = ref.current.getBoundingClientRect()
      const roomBelow = window.innerHeight - r.bottom
      setPos(roomBelow < CAL_HEIGHT && r.top > CAL_HEIGHT
        ? { left: r.left, bottom: window.innerHeight - r.top + 4 }
        : { left: r.left, top: r.bottom + 4 })
    }
    setOpen(o => !o)
  }

  const displayValue = value
    ? parseIso(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const prevMonth = () => setView(v => {
    const m = v.month === 0 ? 11 : v.month - 1
    const y = v.month === 0 ? v.year - 1 : v.year
    return { year: y, month: m }
  })

  const nextMonth = () => setView(v => {
    const m = v.month === 11 ? 0 : v.month + 1
    const y = v.month === 11 ? v.year + 1 : v.year
    return { year: y, month: m }
  })

  const selectDay = day => {
    onChange(toIso(view.year, view.month, day))
    setOpen(false)
  }

  const days     = new Date(view.year, view.month + 1, 0).getDate()
  const firstDay = new Date(view.year, view.month, 1).getDay()
  const today    = todayIso()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="form-input dp-trigger"
        onClick={toggle}
      >
        <span style={{ color: value ? 'var(--t1)' : 'var(--t3)' }}>
          {displayValue || 'Select date'}
        </span>
        <span className="dp-caret">▾</span>
      </button>

      {open && pos && createPortal(
        <div className="dp-cal" ref={calRef} style={{ position: 'fixed', ...pos }}>
          <div className="dp-header">
            <button type="button" className="dp-nav" onClick={prevMonth}>‹</button>
            <span className="dp-month-label">{MONTHS[view.month]} {view.year}</span>
            <button type="button" className="dp-nav" onClick={nextMonth}>›</button>
          </div>

          <div className="dp-grid">
            {DOW.map(l => <div key={l} className="dp-dow">{l}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`e-${i}`} />
              const iso = toIso(view.year, view.month, day)
              const sel = iso === value
              const tod = iso === today && !sel
              return (
                <button
                  key={iso}
                  type="button"
                  className={`dp-day${sel ? ' dp-sel' : ''}${tod ? ' dp-today' : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
