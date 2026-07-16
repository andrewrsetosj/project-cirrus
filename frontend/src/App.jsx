import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  // All accounts are fetched once and filtered client-side, so switching
  // accounts is instant instead of waiting on a refetch of stale views.
  const [allTrades,        setAllTrades]        = useState([])
  const [allPositions,     setAllPositions]     = useState([])
  const [prices,        setPrices]        = useState({})
  const [pricesLoading, setPricesLoading] = useState(false)
  const [spyData,        setSpyData]        = useState({})
  const [indexPrices,    setIndexPrices]    = useState({})
  const [indexHistory,   setIndexHistory]   = useState({ VOO: {}, QQQ: {} })
  const [allContributions, setAllContributions] = useState([])
  const [allIncomeLogs,    setAllIncomeLogs]    = useState([])
  const validTabs = ['dashboard', 'trades', 'positions', 'contributions', 'research', 'checkpoint']
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.slice(1)
    return validTabs.includes(hash) ? hash : 'dashboard'
  })

  const handleSetTab = (newTab) => {
    window.location.hash = newTab
    setTab(newTab)
  }

  // ── Account (ira | brokerage | all) ─────────────────────────────────────────

  const [account, setAccount] = useState(() => {
    const saved = localStorage.getItem('cirrus-account')
    return ['ira', 'brokerage', 'all'].includes(saved) ? saved : 'ira'
  })

  const handleSetAccount = (acct) => {
    localStorage.setItem('cirrus-account', acct)
    setAccount(acct)
  }

  // Views see only the selected account's rows (rows carry `account` from the API)
  const byAccount = useCallback(
    list => account === 'all' ? list : list.filter(r => (r.account ?? 'ira') === account),
    [account]
  )
  const trades        = useMemo(() => byAccount(allTrades),        [allTrades, byAccount])
  const positions     = useMemo(() => byAccount(allPositions),     [allPositions, byAccount])
  const contributions = useMemo(() => byAccount(allContributions), [allContributions, byAccount])
  const incomeLogs    = useMemo(() => byAccount(allIncomeLogs),    [allIncomeLogs, byAccount])

  const posPriceFetching = useRef(false)

  // ── Closed trades ──────────────────────────────────────────────────────────

  const fetchTrades = useCallback(async () => {
    const res = await fetch('/trades?account=all')
    const raw = await res.json()
    setAllTrades(raw.map(t => computeFields({ ...t })))
  }, [])

  const addTrade = async (data) => {
    const res = await fetch('/trades', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, account }),
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
    const res = await fetch('/positions?account=all')
    setAllPositions(await res.json())
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

  // Always quote every account's symbols so account switches never wait on Yahoo
  const refreshPrices = useCallback(() => fetchPrices(allPositions), [allPositions, fetchPrices])

  const addPosition = async (data) => {
    const res = await fetch('/positions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, account }),
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
    const res = await fetch('/contributions?account=all')
    setAllContributions(await res.json())
  }, [])

  const fetchIncomeLogs = useCallback(async () => {
    const res = await fetch('/income?account=all')
    setAllIncomeLogs(await res.json())
  }, [])

  const addIncomeLog = async (data) => {
    const res = await fetch('/income', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, account }),
    })
    if (res.ok) { await fetchIncomeLogs(); return null }
    return (await res.json()).error || 'Failed to add income entry.'
  }

  const addContribution = async (data) => {
    const res = await fetch('/contributions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, account }),
    })
    if (res.ok) { await fetchContributions(); return null }
    return (await res.json()).error || 'Failed to add contribution.'
  }

  const deleteContribution = async (id) => {
    await fetch(`/contributions/${id}`, { method: 'DELETE' })
    fetchContributions()
  }

  // One-time data load; account switching filters in memory, no refetch.
  useEffect(() => {
    fetchTrades(); fetchPositions(); fetchCheckpoints(); fetchContributions(); fetchIncomeLogs()
  }, [fetchTrades, fetchPositions, fetchCheckpoints, fetchContributions, fetchIncomeLogs])

  useEffect(() => {
    fetch('/plaid/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) fetch('/plaid/holdings')
          .then(r => r.json())
          .then(h => { if (!h.error) setPlaidHoldings(h) })
          .catch(() => {})
      })
      .catch(() => {})
  }, [])

  // Fetch benchmark history (SPY/VOO/QQQ) from the earliest contribution date
  // across ALL accounts — a superset range serves every account view, so this
  // runs once rather than on every account switch.
  useEffect(() => {
    if (!allContributions.length) return
    const start = allContributions.reduce((min, c) => c.date < min ? c.date : min, allContributions[0].date)
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
  }, [allContributions])

  // Initial price load when positions arrive (all accounts' symbols)
  useEffect(() => { if (allPositions.length) fetchPrices(allPositions) }, [allPositions, fetchPrices])

  // 2-second auto-refresh for position prices when on Positions tab
  useEffect(() => {
    if (tab !== 'positions' || !allPositions.length) return
    const id = setInterval(() => fetchPrices(allPositions), 2000)
    return () => clearInterval(id)
  }, [tab, allPositions, fetchPrices])

  const combined = account === 'all'

  return (
    <div className="app">
      <Header account={account} onAccount={handleSetAccount} />
      <TabBar tab={tab} onTab={handleSetTab} positionCount={positions.length} checkpointCount={checkpoints.length} />
      <main className="main">
        {tab === 'dashboard' && <Dashboard trades={trades} spyData={spyData} indexPrices={indexPrices} indexHistory={indexHistory} contributions={contributions} positions={positions} prices={prices} incomeLogs={incomeLogs} onAddIncome={combined ? null : addIncomeLog} />}
        {tab === 'trades'    && <Trades trades={trades} onAdd={combined ? null : addTrade} onDelete={deleteTrade} onUpdate={updateTrade} positions={positions} onClosePosition={closePosition} />}
        {tab === 'positions' && (
          <>
          <Positions
            positions={positions} prices={prices} pricesLoading={pricesLoading}
            onRefreshPrices={refreshPrices} onAdd={combined ? null : addPosition} onUpdate={updatePosition}
            onDelete={deletePosition} onClose={closePosition}
          />
          </>
        )}
        {tab === 'contributions' && <Contributions contributions={contributions} onAdd={combined ? null : addContribution} onDelete={deleteContribution} />}
        <div style={{ display: tab === 'research' ? 'block' : 'none' }}>
          <Research checkpoints={checkpoints} onCheckpoint={addCheckpoint} />
        </div>
        {tab === 'checkpoint' && <CheckpointTab checkpoints={checkpoints} onDelete={deleteCheckpoint} />}
      </main>
    </div>
  )
}
