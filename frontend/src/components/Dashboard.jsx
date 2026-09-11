import React, { useState, useEffect } from 'react'
import { r2, tradeCategory, xirr } from '../utils/compute'
import { fmtDollar, fmtPct, fmtNum } from '../utils/format'
import MetricCard from './MetricCard'
import MetricModal from './MetricModal'
import { EquityCurve, PortfolioTimeSeries, SymbolPL, MonthlyPL, WinLossChart, HoldScatter, INDEX_COLORS } from './Charts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmtMonth = m => { const [y, mo] = m.split('-'); return `${MONTHS[+mo-1]} '${y.slice(2)}` }

function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>
}

// ── Symbol performance table ─────────────────────────────────────────────────

function SymbolTable({ trades }) {
  const [expanded, setExpanded] = useState(new Set())

  const map = {}
  trades.forEach(t => {
    if (!map[t.symbol]) map[t.symbol] = { trades: 0, totalPL: 0, totalDays: 0, cagrSum: 0, cagrCount: 0, totalSell: 0, totalShares: 0, rows: [] }
    const s = map[t.symbol]
    s.trades++
    s.totalPL      = r2(s.totalPL + t.net)
    s.totalDays   += t.days_held
    s.totalSell   += t.total_sell
    s.totalShares += t.shares
    if (t.cagr != null) { s.cagrSum += t.cagr; s.cagrCount++ }
    s.rows.push(t)
  })

  const rows = Object.entries(map)
    .map(([sym, s]) => ({
      sym,
      trades: s.trades,
      avgSellPrice: s.totalShares > 0 ? r2(s.totalSell / s.totalShares) : null,
      totalPL: s.totalPL,
      avgPL: r2(s.totalPL / s.trades),
      avgDays: Math.round(s.totalDays / s.trades),
      avgCagr: s.cagrCount ? s.cagrSum / s.cagrCount : null,
      rows: s.rows.sort((a, b) => a.open_date.localeCompare(b.open_date)),
    }))
    .sort((a, b) => b.totalPL - a.totalPL)

  return (
    <div className="sym-table-wrap">
      <table className="sym-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th className="r">Trades</th>
            <th className="r">Avg Sale/sh</th>
            <th className="r">Total P&amp;L</th>
            <th className="r">Avg P&amp;L</th>
            <th className="r">Avg Days</th>
            <th className="r">Avg CAGR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <React.Fragment key={r.sym}>
              <tr
                onClick={() => setExpanded(prev => {
                  const next = new Set(prev)
                  next.has(r.sym) ? next.delete(r.sym) : next.add(r.sym)
                  return next
                })}
                style={{ cursor: 'pointer' }}
              >
                <td className="sym-cell">
                  <span style={{ marginRight: 7, color: 'var(--t3)', fontSize: 9 }}>
                    {expanded.has(r.sym) ? '▼' : '▶'}
                  </span>
                  {r.sym}
                </td>
                <td className="r num-cell">{r.trades}</td>
                <td className="r num-cell">{r.avgSellPrice != null ? fmtDollar(r.avgSellPrice) : '—'}</td>
                <td className={`r num-cell ${r.totalPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(r.totalPL)}</td>
                <td className={`r num-cell ${r.avgPL   >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(r.avgPL)}</td>
                <td className="r num-cell muted-cell">{r.avgDays}</td>
                <td className="r num-cell muted-cell">{r.avgCagr != null ? fmtPct(r.avgCagr, 1) : '—'}</td>
              </tr>
              {expanded.has(r.sym) && (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <div style={{ background: 'var(--bg-alt, rgba(255,255,255,0.03))', borderBottom: '1px solid var(--bdr)', padding: '4px 0 8px 0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--bdr)' }}>
                            <th style={{ width: 32 }} />
                            <th style={{ textAlign: 'left',  padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Open</th>
                            <th style={{ textAlign: 'left',  padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Close</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Shares</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Cost</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Proceeds</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Net P&amp;L</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Perf %</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>Days</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--t3)', fontWeight: 500, letterSpacing: '0.06em' }}>CAGR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.rows.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--bdr-subtle, rgba(255,255,255,0.04))' }}>
                              <td style={{ width: 32 }} />
                              <td style={{ padding: '5px 8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{t.open_date}</td>
                              <td style={{ padding: '5px 8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{t.close_date}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{t.shares}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{fmtDollar(t.total_buy)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{fmtDollar(t.total_sell)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: t.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtDollar(t.net)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: t.performance >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtPct(t.performance)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{t.days_held}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{t.cagr != null ? fmtPct(t.cagr, 1) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Monthly breakdown table ───────────────────────────────────────────────────

function MonthlyTable({ trades }) {
  const map = {}
  trades.forEach(t => {
    const m = t.close_date.slice(0, 7)
    if (!map[m]) map[m] = { trades: 0, wins: 0, totalPL: 0, best: -Infinity, worst: Infinity }
    const s = map[m]
    s.trades++
    if (t.net > 0) s.wins++
    s.totalPL = r2(s.totalPL + t.net)
    s.best    = Math.max(s.best,  t.net)
    s.worst   = Math.min(s.worst, t.net)
  })

  const rows = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, s]) => ({ m, ...s, winRate: s.wins / s.trades }))

  return (
    <div className="sym-table-wrap">
      <table className="sym-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="r">Trades</th>
            <th className="r">Win%</th>
            <th className="r">Net P&amp;L</th>
            <th className="r">Best Trade</th>
            <th className="r">Worst Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.m}>
              <td className="sym-cell" style={{ fontFamily: 'var(--sans)', fontWeight: 500 }}>{fmtMonth(r.m)}</td>
              <td className="r num-cell">{r.trades}</td>
              <td className="r num-cell">{fmtPct(r.winRate, 0)}</td>
              <td className={`r num-cell ${r.totalPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(r.totalPL)}</td>
              <td className="r num-cell gain-cell">{r.best  > -Infinity ? fmtDollar(r.best)  : '—'}</td>
              <td className="r num-cell loss-cell">{r.worst <  Infinity ? fmtDollar(r.worst) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Duration category table ───────────────────────────────────────────────────

const CAT_ORDER = ['Day', 'Swing', 'Position', 'Long-term']

function DurationTable({ trades }) {
  const map = {}
  CAT_ORDER.forEach(c => { map[c] = { trades: 0, wins: 0, totalPL: 0, cagrSum: 0, cagrCount: 0, totalDays: 0 } })
  trades.forEach(t => {
    const s = map[t.category]
    if (!s) return
    s.trades++
    if (t.net > 0) s.wins++
    s.totalPL    = r2(s.totalPL + t.net)
    s.totalDays += t.days_held
    if (t.cagr != null) { s.cagrSum += t.cagr; s.cagrCount++ }
  })

  return (
    <div className="sym-table-wrap">
      <table className="sym-table">
        <thead>
          <tr>
            <th>Type</th>
            <th className="r">Trades</th>
            <th className="r">Win%</th>
            <th className="r">Total P&amp;L</th>
            <th className="r">Avg P&amp;L</th>
            <th className="r">Avg Days</th>
            <th className="r">Avg CAGR</th>
          </tr>
        </thead>
        <tbody>
          {CAT_ORDER.map(cat => {
            const s = map[cat]
            if (!s.trades) return (
              <tr key={cat}>
                <td className="sym-cell" style={{ fontFamily: 'var(--sans)', fontWeight: 500 }}>{cat}</td>
                <td className="r num-cell muted-cell">0</td>
                <td colSpan={5} className="r num-cell muted-cell">—</td>
              </tr>
            )
            const winRate = s.wins / s.trades
            const avgPL   = r2(s.totalPL / s.trades)
            const avgDays = Math.round(s.totalDays / s.trades)
            const avgCagr = s.cagrCount ? s.cagrSum / s.cagrCount : null
            return (
              <tr key={cat}>
                <td className="sym-cell" style={{ fontFamily: 'var(--sans)', fontWeight: 500 }}>{cat}</td>
                <td className="r num-cell">{s.trades}</td>
                <td className="r num-cell">{fmtPct(winRate, 0)}</td>
                <td className={`r num-cell ${s.totalPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(s.totalPL)}</td>
                <td className={`r num-cell ${avgPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(avgPL)}</td>
                <td className="r num-cell muted-cell">{avgDays}</td>
                <td className="r num-cell muted-cell">{avgCagr != null ? fmtPct(avgCagr, 1) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Top / Bottom trades ───────────────────────────────────────────────────────

function TopTradesTable({ trades, variant }) {
  const sorted = [...trades].sort((a, b) => variant === 'winners' ? b.net - a.net : a.net - b.net)
  const top = sorted.slice(0, 5)
  const isBest = variant === 'winners'

  return (
    <div className="sym-table-wrap">
      <table className="sym-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Type</th>
            <th className="r">Days</th>
            <th className="r">Net P&amp;L</th>
            <th className="r">Perf %</th>
            <th className="r">CAGR</th>
          </tr>
        </thead>
        <tbody>
          {top.map(t => (
            <tr key={`${t.id}`}>
              <td className="sym-cell">{t.symbol}</td>
              <td className="num-cell muted-cell" style={{ fontFamily: 'var(--sans)', fontSize: 11 }}>{t.category}</td>
              <td className="r num-cell muted-cell">{t.days_held}</td>
              <td className={`r num-cell ${isBest ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(t.net)}</td>
              <td className={`r num-cell ${isBest ? 'gain-cell' : 'loss-cell'}`}>{fmtPct(t.performance)}</td>
              <td className="r num-cell muted-cell">{fmtPct(t.cagr, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({ account = 'ira', trades, spyData = {}, indexPrices = {}, indexHistory = { RSP: {}, QQQ: {} }, holdingsHistory = {}, contributions = [], positions = [], prices = {}, incomeLogs = [] }) {
  const [modal, setModal] = useState(null)
  // Benchmark timing: unclamped buys the index on each contribution date ("what if
  // I'd indexed every deposit"); clamped defers pre-first-trade deposits to the
  // first trade date ("what if I'd indexed once I started investing").
  const [clamped, setClamped] = useState(() => {
    try { return localStorage.getItem('cirrus.benchClamped') === '1' } catch { return false }
  })
  const toggleClamp = next => {
    setClamped(next)
    try { localStorage.setItem('cirrus.benchClamped', next ? '1' : '0') } catch { /* private mode */ }
  }

  // Daily value/benchmark series and the risk stats derived from it. Computed
  // server-side because it joins holdings against per-symbol price history.
  const [timeline, setTimeline] = useState(null)
  const [timelineMode, setTimelineMode] = useState('value')
  useEffect(() => {
    let live = true
    setTimeline(null)
    fetch(`/analytics/timeseries?account=${account}&clamped=${clamped ? 1 : 0}`)
      .then(r => r.json())
      .then(d => { if (live) setTimeline(d) })
      .catch(() => { if (live) setTimeline({ series: [], stats: {}, benchmarks: {} }) })
    return () => { live = false }
  }, [account, clamped])

  // Hooks must run on every render, so this early-out comes after them.
  if (!trades.length) return null

  // Headline figures pulled from the daily series, plus the sparkline samples.
  const twr     = timeline?.stats?.twr ?? null
  const spyTwr  = timeline?.benchmark_stats?.SPY?.twr ?? null
  const beatSpy = (twr != null && spyTwr != null) ? twr >= spyTwr : null
  const spyMaxDD = timeline?.benchmark_stats?.SPY?.max_drawdown ?? null
  const valueSpark = timeline?.series?.map(r => r.value) ?? null
  // Flow-neutral growth, so the sparkline shows performance rather than deposits.
  const growthSpark = (() => {
    const rows = timeline?.series
    if (!rows?.length) return null
    const out = []
    let level = 1, prev = null
    for (const r of rows) {
      if (prev != null && prev > 0) level *= (r.value - (r.flow ?? 0)) / prev
      out.push((level - 1) * 100)
      prev = r.value
    }
    return out
  })()

  // Each income entry is an individual dividend/interest event; total income
  // is the sum of every logged entry (managed in the Income tab).
  const currentIncome = incomeLogs.length ? r2(incomeLogs.reduce((s, e) => s + e.amount, 0)) : null

  const winners = trades.filter(t => t.net > 0)
  const losers  = trades.filter(t => t.net < 0)

  const totalPL      = r2(trades.reduce((s, t) => s + t.net, 0))
  const winRate      = trades.length ? winners.length / trades.length : 0
  const totalWin     = winners.reduce((s, t) => s + t.net, 0)
  const totalLoss    = losers.reduce((s, t)  => s + t.net, 0)
  const pf           = totalLoss < 0 ? r2(totalWin / Math.abs(totalLoss)) : Infinity
  const avgWinner    = winners.length ? r2(totalWin  / winners.length) : null
  const avgLoser     = losers.length  ? r2(totalLoss / losers.length)  : null
  const bestWin      = winners.length ? Math.max(...winners.map(t => t.net)) : null
  const worstLoss    = losers.length  ? Math.min(...losers.map(t => t.net)) : null
  const largestGain  = bestWin != null ? winners.find(t => t.net === bestWin) : null
  const largestLoss  = worstLoss != null ? losers.find(t => t.net === worstLoss) : null
  const avgHoldDays  = Math.round(trades.reduce((s, t) => s + t.days_held, 0) / trades.length)
  const totalCapital = r2(trades.reduce((s, t) => s + t.total_buy, 0))
  const returnOnCap  = totalCapital > 0 ? totalPL / totalCapital : 0

  // Lookup a price from a history dict, searching up to 5 days back for weekends/holidays.
  // Steps in UTC so a DST shift can't land the lookback on the wrong calendar day.
  const lookupPrice = (history, dateStr) => {
    if (history[dateStr] != null) return history[dateStr]
    const d = new Date(dateStr + 'T12:00:00Z')
    for (let i = 1; i <= 5; i++) {
      d.setUTCDate(d.getUTCDate() - 1)
      const s = d.toISOString().slice(0, 10)
      if (history[s] != null) return history[s]
    }
    return null
  }

  // Earliest money actually put to work — open positions count too, otherwise a
  // holding you never sold would push this date forward and skew clamped mode.
  const firstInvestDate = [...trades, ...positions]
    .reduce((min, x) => (min == null || x.open_date < min ? x.open_date : min), null)

  // Simulate investing all contributions into a fund (buys on deposits, sells on withdrawals/fees).
  // When clamped, contributions predating firstInvestDate buy at that date instead,
  // so cash that sat idle before the first trade isn't credited with market exposure.
  // `history` is the dividend-adjusted series, so this is a total-return benchmark.
  const simulateFundValue = (history, currentPrice) => {
    if (!currentPrice || !Object.keys(history).length) return null
    const totalShares = contributions.reduce((sum, c) => {
      const buyOn = clamped && firstInvestDate && c.date < firstInvestDate ? firstInvestDate : c.date
      const price = lookupPrice(history, buyOn)
      return price ? sum + c.amount / price : sum
    }, 0)
    return totalShares > 0 ? r2(totalShares * currentPrice) : null
  }

  const netContributions = r2(contributions.reduce((s, c) => s + c.amount, 0))
  const unrealizedPL = r2(positions.reduce((s, p) => {
    const price = prices[p.symbol]
    return price != null ? s + (price * p.shares - p.total_buy) : s
  }, 0))
  const portfolioValue = r2(netContributions + totalPL + unrealizedPL + (currentIncome ?? 0))
  const xirrRate = contributions.length >= 1 ? xirr([
    ...contributions.map(c => ({ date: c.date, amount: -c.amount })),
    { date: new Date().toISOString().slice(0, 10), amount: portfolioValue },
  ]) : null

  // ── Modal detail content per card ────────────────────────────────────────
  const modals = {
    'Total P&L': {
      value: fmtDollar(totalPL), variant: totalPL >= 0 ? 'gain' : 'loss',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Total P&L</span> = sum of net P&L across all {trades.length} closed trades
          </div>
          <table className="mm-table">
            <thead><tr><th>Symbol</th><th>Close Date</th><th className="r">Net P&L</th></tr></thead>
            <tbody>
              {[...trades].sort((a,b) => b.net - a.net).map(t => (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td className="muted">{t.close_date}</td>
                  <td className={`r ${t.net >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(t.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    'Account Value': {
      value: fmtDollar(portfolioValue), variant: portfolioValue >= 0 ? 'gain' : 'loss',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Account Value</span> = contributions + realized P&L + unrealized P&L + income{'\n'}
            = <span className="hl">{fmtDollar(netContributions)}</span> + <span className={totalPL >= 0 ? 'gain' : 'loss'}>{fmtDollar(totalPL)}</span> + <span className={unrealizedPL >= 0 ? 'gain' : 'loss'}>{fmtDollar(unrealizedPL)}</span> + <span className="gain">{currentIncome != null ? fmtDollar(currentIncome) : '—'}</span> = <span className="hl">{fmtDollar(portfolioValue)}</span>
          </div>
          <table className="mm-table">
            <thead><tr><th>Component</th><th className="r">Value</th></tr></thead>
            <tbody>
              <tr><td>Net Contributions</td><td className="r">{fmtDollar(netContributions)}</td></tr>
              <tr><td>Realized P&L</td><td className={`r ${totalPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(totalPL)}</td></tr>
              <tr><td>Unrealized P&L</td><td className={`r ${unrealizedPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(unrealizedPL)}</td></tr>
              <tr><td>Income</td><td className="r gain-cell">{currentIncome != null ? fmtDollar(currentIncome) : '—'}</td></tr>
              <tr style={{ borderTop: '1px solid var(--bdr-mid)', fontWeight: 600 }}><td>Total Account Value</td><td className={`r ${portfolioValue >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(portfolioValue)}</td></tr>
            </tbody>
          </table>
        </>
      ),
    },
    'Profit Factor': {
      value: pf === Infinity ? '∞' : fmtNum(pf), variant: '',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Profit Factor</span> = total won ÷ |total lost|{'\n'}
            = <span className="gain">{fmtDollar(totalWin)}</span> ÷ <span className="loss">{fmtDollar(Math.abs(totalLoss))}</span> = <span className="hl">{pf === Infinity ? '∞' : fmtNum(pf)}</span>{'\n'}
            A value {'>'} 1 means you make more than you lose.
          </div>
          <table className="mm-table">
            <thead><tr><th>Bucket</th><th className="r">Trades</th><th className="r">Total</th><th className="r">Avg/trade</th></tr></thead>
            <tbody>
              <tr>
                <td className="gain-cell">Winners</td>
                <td className="r">{winners.length}</td>
                <td className="r gain-cell">{fmtDollar(totalWin)}</td>
                <td className="r muted">{avgWinner != null ? fmtDollar(avgWinner) : '—'}</td>
              </tr>
              <tr>
                <td className="loss-cell">Losers</td>
                <td className="r">{losers.length}</td>
                <td className="r loss-cell">{fmtDollar(totalLoss)}</td>
                <td className="r muted">{avgLoser != null ? fmtDollar(avgLoser) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
    },
    'Return on Capital': {
      value: fmtPct(returnOnCap, 2), variant: '',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Return on Capital</span> = Total P&L ÷ Total Capital Deployed{'\n'}
            = <span className="gain">{fmtDollar(totalPL)}</span> ÷ <span className="hl">{fmtDollar(totalCapital)}</span> = <span className={returnOnCap >= 0 ? 'gain' : 'loss'}>{fmtPct(returnOnCap, 2)}</span>
          </div>
          <table className="mm-table">
            <thead><tr><th>Symbol</th><th className="r">Capital</th><th className="r">Net P&L</th><th className="r">ROC</th></tr></thead>
            <tbody>
              {[...trades].sort((a,b) => b.total_buy - a.total_buy).map(t => (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td className="r muted">{fmtDollar(t.total_buy)}</td>
                  <td className={`r ${t.net >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(t.net)}</td>
                  <td className={`r ${t.net >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtPct(t.net / t.total_buy, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    'Avg Winner': {
      value: avgWinner != null ? fmtDollar(avgWinner) : '—', variant: 'gain',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Avg Winner</span> = total won ÷ winning trades{'\n'}
            = <span className="gain">{fmtDollar(totalWin)}</span> ÷ {winners.length} = <span className="gain">{avgWinner != null ? fmtDollar(avgWinner) : '—'}</span>
          </div>
          <table className="mm-table">
            <thead><tr><th>Symbol</th><th>Close Date</th><th className="r">Net P&L</th><th className="r">Perf %</th></tr></thead>
            <tbody>
              {[...winners].sort((a,b) => b.net - a.net).map(t => (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td className="muted">{t.close_date}</td>
                  <td className="r gain-cell">{fmtDollar(t.net)}</td>
                  <td className="r gain-cell">{fmtPct(t.performance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    'Avg Loser': {
      value: avgLoser != null ? fmtDollar(avgLoser) : '—', variant: 'loss',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Avg Loser</span> = total lost ÷ losing trades{'\n'}
            = <span className="loss">{fmtDollar(totalLoss)}</span> ÷ {losers.length} = <span className="loss">{avgLoser != null ? fmtDollar(avgLoser) : '—'}</span>
          </div>
          <table className="mm-table">
            <thead><tr><th>Symbol</th><th>Close Date</th><th className="r">Net P&L</th><th className="r">Perf %</th></tr></thead>
            <tbody>
              {[...losers].sort((a,b) => a.net - b.net).map(t => (
                <tr key={t.id}>
                  <td>{t.symbol}</td>
                  <td className="muted">{t.close_date}</td>
                  <td className="r loss-cell">{fmtDollar(t.net)}</td>
                  <td className="r loss-cell">{fmtPct(t.performance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    'Income': {
      value: currentIncome != null ? fmtDollar(currentIncome) : '—', variant: '',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">Income</span> = sum of every logged dividend &amp; interest entry.{'\n'}
            Add, edit, or remove entries in the Income tab.
          </div>
          {incomeLogs.length > 0 ? (
            <table className="mm-table">
              <thead><tr><th>Date</th><th className="r">Amount</th><th>Note</th></tr></thead>
              <tbody>
                {[...incomeLogs].reverse().map(e => (
                  <tr key={e.id}>
                    <td className="muted">{e.date}</td>
                    <td className="r gain-cell">{fmtDollar(e.amount)}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{e.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>No entries yet. Log your first entry in the Income tab.</div>
          )}
        </>
      ),
    },
    'XIRR': {
      value: xirrRate != null ? fmtPct(xirrRate, 2) : '—', variant: '',
      content: (
        <>
          <div className="mm-formula">
            <span className="hl">XIRR</span> = annualized internal rate of return on your contributions.{'\n'}
            Each contribution is a cash outflow; withdrawals/fees are inflows; current portfolio value is the final inflow.{'\n'}
            Portfolio value = contributions + realized P&L + unrealized P&L + income{'\n'}
            = <span className="hl">{fmtDollar(netContributions)}</span> + <span className={totalPL >= 0 ? 'gain' : 'loss'}>{fmtDollar(totalPL)}</span> + <span className={unrealizedPL >= 0 ? 'gain' : 'loss'}>{fmtDollar(unrealizedPL)}</span> + <span className="gain">{currentIncome != null ? fmtDollar(currentIncome) : '—'}</span> = <span className="hl">{fmtDollar(portfolioValue)}</span>
          </div>
          <table className="mm-table">
            <thead><tr><th>Date</th><th className="r">Cash Flow</th><th>Note</th></tr></thead>
            <tbody>
              {contributions.map((c, i) => {
                const flow = -c.amount
                return (
                  <tr key={i}>
                    <td className="muted">{c.date}</td>
                    <td className={`r ${flow >= 0 ? 'loss-cell' : 'gain-cell'}`}>
                      {flow >= 0 ? `−${fmtDollar(c.amount)}` : `+${fmtDollar(Math.abs(c.amount))}`}
                    </td>
                    <td className="muted" style={{ fontSize: 11 }}>{c.note || 'contribution'}</td>
                  </tr>
                )
              })}
              <tr>
                <td className="muted">{new Date().toISOString().slice(0,10)}</td>
                <td className="r gain-cell">+{fmtDollar(portfolioValue)}</td>
                <td className="muted" style={{ fontSize: 11 }}>portfolio value (today)</td>
              </tr>
            </tbody>
          </table>
        </>
      ),
    },
    'Largest Gain': {
      value: largestGain ? fmtDollar(largestGain.net) : '—', variant: 'gain',
      content: largestGain ? (
        <>
          <div className="mm-formula">
            Best single closed trade: <span className="hl">{largestGain.symbol}</span> closed {largestGain.close_date}
          </div>
          <table className="mm-table">
            <thead><tr><th>Field</th><th className="r">Value</th></tr></thead>
            <tbody>
              <tr><td>Open date</td><td className="r muted">{largestGain.open_date}</td></tr>
              <tr><td>Shares</td><td className="r muted">{largestGain.shares}</td></tr>
              <tr><td>Cost basis</td><td className="r muted">{fmtDollar(largestGain.total_buy)}</td></tr>
              <tr><td>Proceeds</td><td className="r muted">{fmtDollar(largestGain.total_sell)}</td></tr>
              <tr><td>Net P&L</td><td className="r gain-cell">{fmtDollar(largestGain.net)}</td></tr>
              <tr><td>Return</td><td className="r gain-cell">{fmtPct(largestGain.performance)}</td></tr>
              <tr><td>Days held</td><td className="r muted">{largestGain.days_held}</td></tr>
            </tbody>
          </table>
        </>
      ) : null,
    },
    'Largest Loss': {
      value: largestLoss ? fmtDollar(largestLoss.net) : '—', variant: 'loss',
      content: largestLoss ? (
        <>
          <div className="mm-formula">
            Worst single closed trade: <span className="hl">{largestLoss.symbol}</span> closed {largestLoss.close_date}
          </div>
          <table className="mm-table">
            <thead><tr><th>Field</th><th className="r">Value</th></tr></thead>
            <tbody>
              <tr><td>Open date</td><td className="r muted">{largestLoss.open_date}</td></tr>
              <tr><td>Shares</td><td className="r muted">{largestLoss.shares}</td></tr>
              <tr><td>Cost basis</td><td className="r muted">{fmtDollar(largestLoss.total_buy)}</td></tr>
              <tr><td>Proceeds</td><td className="r muted">{fmtDollar(largestLoss.total_sell)}</td></tr>
              <tr><td>Net P&L</td><td className="r loss-cell">{fmtDollar(largestLoss.net)}</td></tr>
              <tr><td>Return</td><td className="r loss-cell">{fmtPct(largestLoss.performance)}</td></tr>
              <tr><td>Days held</td><td className="r muted">{largestLoss.days_held}</td></tr>
            </tbody>
          </table>
        </>
      ) : null,
    },
  }

  return (
    <div className="dashboard">

      {modal && (
        <MetricModal title={modal} value={modals[modal].value} variant={modals[modal].variant} onClose={() => setModal(null)}>
          {modals[modal].content}
        </MetricModal>
      )}

      {/* ── Metrics ──
          Three headline numbers carry the size; the rest support them. Colour is
          reserved for figures whose sign or comparison actually means something —
          a metric that is negative by definition stays neutral. */}
      <div className="metric-grid-tiered">
        <MetricCard tier="hero" label="Account Value" value={fmtDollar(portfolioValue)}
                    variant={portfolioValue >= 0 ? 'gain' : 'loss'}
                    secondary={<>contributions + realized + open</>}
                    spark={valueSpark} sparkColor="var(--cyan)"
                    onClick={() => setModal('Account Value')} />
        <MetricCard tier="hero" label="Total P&L" value={fmtDollar(totalPL)}
                    variant={totalPL >= 0 ? 'gain' : 'loss'}
                    secondary={<><span className="hl">{trades.length}</span> closed trades</>}
                    onClick={() => setModal('Total P&L')} />
        <MetricCard tier="hero" label="Time-Weighted Return"
                    value={twr != null ? fmtPct(twr, 2) : '—'}
                    variant={beatSpy == null ? undefined : beatSpy ? 'gain' : 'loss'}
                    secondary={spyTwr != null
                      ? <>SPY <span className="hl">{fmtPct(spyTwr, 2)}</span> · {beatSpy ? 'ahead' : 'behind'} on picking</>
                      : 'deposits removed'}
                    spark={growthSpark}
                    sparkColor={beatSpy === false ? 'var(--red)' : 'var(--green)'} />

        <MetricCard tier="supporting" label="Profit Factor" value={pf === Infinity ? '∞' : fmtNum(pf)}
                    secondary={<>{fmtDollar(totalWin)} won / {fmtDollar(Math.abs(totalLoss))} lost</>}
                    onClick={() => setModal('Profit Factor')} />
        <MetricCard tier="supporting" label="Return on Capital" value={fmtPct(returnOnCap, 2)}
                    secondary={<>on <span className="hl">{fmtDollar(totalCapital)}</span> deployed</>}
                    onClick={() => setModal('Return on Capital')} />
        <MetricCard tier="supporting" label="XIRR" value={xirrRate != null ? fmtPct(xirrRate, 2) : '—'}
                    secondary="incl. deposit timing"
                    onClick={() => setModal('XIRR')} />
        <MetricCard tier="supporting" label="Income" value={currentIncome != null ? fmtDollar(currentIncome) : '—'}
                    secondary="dividends &amp; interest"
                    onClick={() => setModal('Income')} />
        <MetricCard tier="supporting" label="Avg Winner" value={avgWinner != null ? fmtDollar(avgWinner) : '—'}
                    variant="gain"
                    secondary={bestWin != null ? <>best: <span className="hl">{fmtDollar(bestWin)}</span></> : null}
                    onClick={() => setModal('Avg Winner')} />
        <MetricCard tier="supporting" label="Avg Loser" value={avgLoser != null ? fmtDollar(avgLoser) : '—'}
                    variant="loss"
                    secondary={worstLoss != null ? <>worst: <span className="hl">{fmtDollar(worstLoss)}</span></> : null}
                    onClick={() => setModal('Avg Loser')} />
        <MetricCard tier="supporting" label="Largest Gain" value={largestGain != null ? fmtDollar(largestGain.net) : '—'}
                    variant="gain"
                    secondary={largestGain ? <><span className="hl">{largestGain.symbol}</span> · {largestGain.close_date}</> : null}
                    onClick={() => setModal('Largest Gain')} />
        <MetricCard tier="supporting" label="Largest Loss" value={largestLoss != null ? fmtDollar(largestLoss.net) : '—'}
                    variant="loss"
                    secondary={largestLoss ? <><span className="hl">{largestLoss.symbol}</span> · {largestLoss.close_date}</> : null}
                    onClick={() => setModal('Largest Loss')} />
      </div>

      {/* ── Index Fund Equivalency ── */}
      <div className="dash-section">
        <div className="section-head">
          <SectionLabel>Index Fund Benchmark</SectionLabel>
          <div className="bench-toggle" role="group" aria-label="Benchmark buy timing">
            <button
              type="button"
              className={!clamped ? 'active' : undefined}
              aria-pressed={!clamped}
              onClick={() => toggleClamp(false)}
              title="Buy the index on each contribution date — what if every deposit had gone into the index"
            >
              On deposit
            </button>
            <button
              type="button"
              className={clamped ? 'active' : undefined}
              aria-pressed={clamped}
              onClick={() => toggleClamp(true)}
              title={`Deposits before your first trade (${firstInvestDate ?? '—'}) buy at that date instead — what if you'd indexed once you started investing`}
            >
              From first trade
            </button>
          </div>
        </div>
        <div className="section-note">
          total return, dividends reinvested · {clamped
            ? <>deposits before <span className="hl">{firstInvestDate ?? '—'}</span> buy at that date</>
            : <>each deposit buys on its own date</>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { sym: 'SPY', history: spyData },
            { sym: 'RSP', history: indexHistory.RSP },
            { sym: 'QQQ', history: indexHistory.QQQ },
          ].map(({ sym, history }) => {
            const price    = indexPrices[sym]
            const simValue = simulateFundValue(history, price)
            const diff     = simValue != null ? r2(portfolioValue - simValue) : null
            const loading  = !price || !Object.keys(history).length
            return (
              <div key={sym} className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `2px solid ${INDEX_COLORS[sym]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="metric-label" style={{ color: INDEX_COLORS[sym] }}>{sym}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{price ? `@ ${fmtDollar(price)}/sh` : '—'}</span>
                </div>
                <div className="metric-value" style={{ fontSize: 26 }}>
                  {simValue != null ? fmtDollar(simValue) : loading ? <span style={{ color: 'var(--t3)', fontSize: 16 }}>loading…</span> : '—'}
                </div>
                {diff != null && (
                  <div className="metric-secondary">
                    you&apos;re <span className={diff >= 0 ? 'gain' : 'loss'} style={{ fontWeight: 600 }}>
                      {diff >= 0 ? '+' : ''}{fmtDollar(diff)}
                    </span> {diff >= 0 ? 'ahead' : 'behind'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Performance over calendar time ── */}
      <div className="dash-section">
        <div className="section-head">
          <SectionLabel>Performance Over Time</SectionLabel>
          <div className="bench-toggle" role="group" aria-label="Chart units">
            <button type="button" className={timelineMode === 'value' ? 'active' : undefined}
                    aria-pressed={timelineMode === 'value'}
                    onClick={() => setTimelineMode('value')}
                    title="Account value in dollars">Value</button>
            <button type="button" className={timelineMode === 'growth' ? 'active' : undefined}
                    aria-pressed={timelineMode === 'growth'}
                    onClick={() => setTimelineMode('growth')}
                    title="Time-weighted return — deposits removed, so only performance shows">Return %</button>
          </div>
        </div>
        <div className="section-note">
          {timelineMode === 'growth'
            ? 'time-weighted — deposits removed, so this is picking skill, not deposit timing'
            : 'account value including deposits'}
        </div>
        {timeline === null
          ? <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--t3)', fontSize: 13 }}>loading…</div>
          : timeline.series?.length
            ? <PortfolioTimeSeries series={timeline.series} benchmarks={timeline.benchmarks} mode={timelineMode} />
            : <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--t3)', fontSize: 13 }}>no history yet</div>}
      </div>

      {/* ── Risk & return ──
          Volatility, drawdown and the day extremes carry a fixed sign, so their
          colour would restate the label rather than tell you anything. They stay
          neutral; drawdown earns colour only by beating or trailing SPY. */}
      {timeline?.stats?.twr != null && (
        <div className="dash-section">
          <SectionLabel>Risk &amp; Return</SectionLabel>
          <div className="section-note">
            {timeline.stats.days} trading days from <span className="hl">{timeline.start}</span>
            {timeline.stats.beta != null && <> · beta vs SPY</>}
          </div>
          <div className="metric-grid-tiered">
            <MetricCard tier="supporting" label="Annualized"
                        value={timeline.stats.twr_annualized != null ? fmtPct(timeline.stats.twr_annualized, 2) : '—'}
                        variant={(timeline.stats.twr_annualized ?? 0) >= 0 ? 'gain' : 'loss'}
                        secondary="compounded per year" />
            <MetricCard tier="supporting" label="Volatility" value={fmtPct(timeline.stats.volatility, 2)}
                        secondary={<>SPY <span className="hl">{fmtPct(timeline.benchmark_stats?.SPY?.volatility ?? 0, 2)}</span></>} />
            <MetricCard tier="supporting" label="Max Drawdown" value={fmtPct(timeline.stats.max_drawdown, 2)}
                        variant={spyMaxDD == null ? undefined
                                 : timeline.stats.max_drawdown >= spyMaxDD ? 'gain' : 'loss'}
                        secondary={<>SPY <span className="hl">{fmtPct(spyMaxDD ?? 0, 2)}</span></>} />
            <MetricCard tier="supporting" label="Beta vs SPY"
                        value={timeline.stats.beta != null ? fmtNum(timeline.stats.beta) : '—'}
                        secondary={timeline.stats.beta != null
                          ? (timeline.stats.beta > 1 ? 'swings harder than market' : 'swings less than market')
                          : 'needs a moving benchmark'} />
            <MetricCard tier="supporting" label="Sharpe"
                        value={timeline.stats.sharpe != null ? fmtNum(timeline.stats.sharpe) : '—'}
                        variant={timeline.stats.sharpe == null ? undefined
                                 : timeline.stats.sharpe >= 0 ? 'gain' : 'loss'}
                        secondary="return per unit of risk" />
            <MetricCard tier="supporting" label="Sortino"
                        value={timeline.stats.sortino != null ? fmtNum(timeline.stats.sortino) : '—'}
                        variant={timeline.stats.sortino == null ? undefined
                                 : timeline.stats.sortino >= 0 ? 'gain' : 'loss'}
                        secondary="downside risk only" />
            <MetricCard tier="supporting" label="Best Day" value={fmtPct(timeline.stats.best_day, 2)}
                        secondary="largest single-day gain" />
            <MetricCard tier="supporting" label="Worst Day" value={fmtPct(timeline.stats.worst_day, 2)}
                        secondary="largest single-day loss" />
          </div>
        </div>
      )}

      {/* ── Equity Curve ── */}
      <div className="dash-section">
        <SectionLabel>Equity Curve — Total Gain (realized + open)</SectionLabel>
        <div className="chart-full">
          <EquityCurve account={account} trades={trades} spyData={spyData} contributions={contributions} indexHistory={indexHistory} positions={positions} holdingsHistory={holdingsHistory} clamped={clamped} />
        </div>
      </div>

      {/* ── Charts row 1 ── */}
      <div className="dash-section">
        <div className="chart-card">
          <SectionLabel>Monthly P&amp;L</SectionLabel>
          <MonthlyPL trades={trades} />
        </div>
      </div>

      {/* ── Breakdown tables ── */}
      <div className="dash-section">
        <div className="chart-2col">
          <div>
            <SectionLabel>Monthly Breakdown</SectionLabel>
            <MonthlyTable trades={trades} />
          </div>
          <div>
            <SectionLabel>Performance by Trade Type</SectionLabel>
            <DurationTable trades={trades} />
          </div>
        </div>
      </div>

      {/* ── Top / Bottom trades ── */}
      <div className="dash-section">
        <div className="chart-2col">
          <div>
            <SectionLabel>Top 5 Winners</SectionLabel>
            <TopTradesTable trades={trades} variant="winners" />
          </div>
          <div>
            <SectionLabel>Top 5 Losers</SectionLabel>
            <TopTradesTable trades={trades} variant="losers" />
          </div>
        </div>
      </div>

      {/* ── Symbol performance ── */}
      <div className="dash-section">
        <SectionLabel>Performance by Symbol</SectionLabel>
        <SymbolTable trades={trades} />
      </div>

    </div>
  )
}
