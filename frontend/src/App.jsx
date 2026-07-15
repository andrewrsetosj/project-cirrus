import { useState, useEffect, useCallback, useRef } from 'react'
import { computeFields } from './utils/compute'
import Header from './components/Header'
import TabBar from './components/TabBar'
import Dashboard from './components/Dashboard'
import Trades from './components/Trades'
import Positions from './components/Positions'
import Contributions from './components/Contributions'
import FidelityPositions from './components/FidelityPositions'
import Research from './components/Research'
import CheckpointTab from './components/Checkpoint'

export default function App() {
  const [trades,        setTrades]        = useState([])
  const [positions,     setPositions]     = useState([])
  const [prices,        setPrices]        = useState({})
  const [pricesLoading, setPricesLoading] = useState(false)
  const [spyData,        setSpyData]        = useState({})
  const [indexPrices,    setIndexPrices]    = useState({})
  const [indexHistory,   setIndexHistory]   = useState({ VOO: {}, QQQ: {} })
  const [contributions,  setContributions]  = useState([])
  const validTabs = ['dashboard', 'trades', 'positions', 'contributions', 'research', 'checkpoint']
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.slice(1)
    return validTabs.includes(hash) ? hash : 'dashboard'
  })

  const handleSetTab = (newTab) => {
    window.location.hash = newTab
    setTab(newTab)
  }
  const posPriceFetching = useRef(false)

  // ── Closed trades ──────────────────────────────────────────────────────────

  const fetchTrades = useCallback(async () => {
    const res = await fetch('/trades')
    const raw = await res.json()
    setTrades(raw.map(t => computeFields({ ...t })))
  }, [])

  const addTrade = async (data) => {
    const res = await fetch('/trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchTrades(); return null }
    return (await res.json()).error || 'Failed to add trade.'
  }

  const updateTrade = async (id, data) => {
    const res = await fetch(`/trades/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchTrades(); return null }
    return (await res.json()).error || 'Failed to update trade.'
  }

  const deleteTrade = async (id) => {
    await fetch(`/trades/${id}`, { method: 'DELETE' })
    fetchTrades()
  }

  // ── Open positions ─────────────────────────────────────────────────────────

  const fetchPositions = useCallback(async () => {
    const res = await fetch('/positions')
    setPositions(await res.json())
  }, [])

  // Bulk price fetch via /market/prices
  const fetchPrices = useCallback(async (positionsList) => {
    if (posPriceFetching.current) return
    const symbols = [...new Set(positionsList.map(p => p.symbol))]
    if (!symbols.length) return
    posPriceFetching.current = true
    setPricesLoading(true)
    try {
      const res  = await fetch(`/market/prices?symbols=${symbols.join(',')}`)
      const data = await res.json()
      const flat = {}
      Object.entries(data).forEach(([sym, info]) => {
        if (info?.price != null) flat[sym] = info.price
      })
      setPrices(flat)
    } catch {}
    setPricesLoading(false)
    posPriceFetching.current = false
  }, [])

  const refreshPrices = useCallback(() => fetchPrices(positions), [positions, fetchPrices])

  const addPosition = async (data) => {
    const res = await fetch('/positions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchPositions(); return null }
    return (await res.json()).error || 'Failed to add position.'
  }

  const updatePosition = async (id, data) => {
    const res = await fetch(`/positions/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchPositions(); return null }
    return (await res.json()).error || 'Failed to update position.'
  }

  const deletePosition = async (id) => {
    await fetch(`/positions/${id}`, { method: 'DELETE' })
    fetchPositions()
  }

  const closePosition = async (id, data) => {
    const res = await fetch(`/positions/${id}/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await Promise.all([fetchTrades(), fetchPositions()]); return null }
    return (await res.json()).error || 'Failed to close position.'
  }

  // ── Checkpoints ────────────────────────────────────────────────────────────

  const [checkpoints,   setCheckpoints]   = useState([])
  const [plaidHoldings, setPlaidHoldings] = useState([])
  const [incomeLogs,    setIncomeLogs]    = useState([])

  const fetchCheckpoints = useCallback(async () => {
    const res = await fetch('/checkpoints')
    setCheckpoints(await res.json())
  }, [])

  const addCheckpoint = async (symbol, price, name = '') => {
    await fetch('/checkpoints', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, price, name }),
    })
    fetchCheckpoints()
  }

  const deleteCheckpoint = async (id) => {
    await fetch(`/checkpoints/${id}`, { method: 'DELETE' })
    fetchCheckpoints()
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  const fetchContributions = useCallback(async () => {
    const res = await fetch('/contributions')
    setContributions(await res.json())
  }, [])

  const fetchIncomeLogs = useCallback(async () => {
    const res = await fetch('/income')
    setIncomeLogs(await res.json())
  }, [])

  const addIncomeLog = async (data) => {
    const res = await fetch('/income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchIncomeLogs(); return null }
    return (await res.json()).error || 'Failed to add income entry.'
  }

  const addContribution = async (data) => {
    const res = await fetch('/contributions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (res.ok) { await fetchContributions(); return null }
    return (await res.json()).error || 'Failed to add contribution.'
  }

  const deleteContribution = async (id) => {
    await fetch(`/contributions/${id}`, { method: 'DELETE' })
    fetchContributions()
  }

  useEffect(() => {
    fetchTrades(); fetchPositions(); fetchCheckpoints(); fetchContributions(); fetchIncomeLogs()
    fetch('/plaid/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) fetch('/plaid/holdings')
          .then(r => r.json())
          .then(h => { if (!h.error) setPlaidHoldings(h) })
          .catch(() => {})
      })
      .catch(() => {})
  }, [fetchTrades, fetchPositions, fetchCheckpoints, fetchContributions])

  // Fetch benchmark history (SPY/VOO/QQQ) starting from earliest contribution
  // date. Lives here rather than in Dashboard so tab switches don't refetch.
  useEffect(() => {
    if (!contributions.length) return
    const start = contributions.reduce((min, c) => c.date < min ? c.date : min, contributions[0].date)
    fetch(`/market/sparkdata?symbol=SPY&start=${start}`)
      .then(r => r.json()).then(d => setSpyData(d)).catch(() => {})
    Promise.all([
      fetch('/market/prices?symbols=SPY,VOO,QQQ').then(r => r.json()),
      fetch(`/market/sparkdata?symbol=VOO&start=${start}`).then(r => r.json()),
      fetch(`/market/sparkdata?symbol=QQQ&start=${start}`).then(r => r.json()),
    ]).then(([idxPrices, vooHist, qqqHist]) => {
      const flat = {}
      Object.entries(idxPrices).forEach(([sym, info]) => { if (info?.price != null) flat[sym] = info.price })
      setIndexPrices(flat)
      setIndexHistory({ VOO: vooHist, QQQ: qqqHist })
    }).catch(() => {})
  }, [contributions])

  // Initial price load when positions arrive
  useEffect(() => { if (positions.length) fetchPrices(positions) }, [positions, fetchPrices])

  // 2-second auto-refresh for position prices when on Positions tab
  useEffect(() => {
    if (tab !== 'positions' || !positions.length) return
    const id = setInterval(() => fetchPrices(positions), 2000)
    return () => clearInterval(id)
  }, [tab, positions, fetchPrices])

  return (
    <div className="app">
      <Header />
      <TabBar tab={tab} onTab={handleSetTab} positionCount={positions.length} checkpointCount={checkpoints.length} />
      <main className="main">
        {tab === 'dashboard' && <Dashboard trades={trades} spyData={spyData} indexPrices={indexPrices} indexHistory={indexHistory} contributions={contributions} positions={positions} prices={prices} incomeLogs={incomeLogs} onAddIncome={addIncomeLog} />}
        {tab === 'trades'    && <Trades trades={trades} onAdd={addTrade} onDelete={deleteTrade} onUpdate={updateTrade} positions={positions} onClosePosition={closePosition} />}
        {tab === 'positions' && (
          <>
          <Positions
            positions={positions} prices={prices} pricesLoading={pricesLoading}
            onRefreshPrices={refreshPrices} onAdd={addPosition} onUpdate={updatePosition}
            onDelete={deletePosition} onClose={closePosition}
          />
          </>
        )}
        {tab === 'contributions' && <Contributions contributions={contributions} onAdd={addContribution} onDelete={deleteContribution} />}
        <div style={{ display: tab === 'research' ? 'block' : 'none' }}>
          <Research checkpoints={checkpoints} onCheckpoint={addCheckpoint} />
        </div>
        {tab === 'checkpoint' && <CheckpointTab checkpoints={checkpoints} onDelete={deleteCheckpoint} />}
      </main>
    </div>
  )
}
