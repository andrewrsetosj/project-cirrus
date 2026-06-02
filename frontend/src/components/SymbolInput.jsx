import { useState, useEffect, useRef, useCallback } from 'react'

export default function SymbolInput({ value, onChange, required }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0, width: 220 })

  const timerRef = useRef(null)
  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Recalculate dropdown position (fixed, so never clipped by overflow)
  const reposition = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) })
  }

  const search = useCallback(async q => {
    if (!q) { setSuggestions([]); setOpen(false); return }
    try {
      const res = await fetch(`/search?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const data = await res.json()
      setSuggestions(data)
      if (data.length > 0) { reposition(); setOpen(true) }
      else setOpen(false)
    } catch {}
  }, [])

  const handleChange = e => {
    const val = e.target.value.toUpperCase()
    onChange(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 280)
  }

  const select = sym => {
    onChange(sym)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        className="form-input"
        value={value}
        onChange={handleChange}
        onFocus={() => { reposition(); if (suggestions.length > 0) setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        placeholder="AAPL"
        required={required}
        autoComplete="off"
        spellCheck={false}
        style={{ width: '100%' }}
      />
      {open && (
        <div
          className="sym-dropdown"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
        >
          {suggestions.map(s => (
            <button
              key={s.symbol}
              type="button"
              className="sym-option"
              onMouseDown={e => { e.preventDefault(); select(s.symbol) }}
            >
              <span className="sym-opt-ticker">{s.symbol}</span>
              <span className="sym-opt-name">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
