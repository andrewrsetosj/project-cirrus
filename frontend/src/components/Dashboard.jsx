import React, { useState } from 'react'
import { r2, tradeCategory, xirr } from '../utils/compute'
import { fmtDollar, fmtPct, fmtNum } from '../utils/format'
import MetricCard from './MetricCard'
import { EquityCurve, SymbolPL, MonthlyPL, WinLossChart, HoldScatter } from './Charts'

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
    if (!map[t.symbol]) map[t.symbol] = { trades: 0, wins: 0, totalPL: 0, totalDays: 0, cagrSum: 0, cagrCount: 0, rows: [] }
    const s = map[t.symbol]
    s.trades++
    if (t.net > 0) s.wins++
    s.totalPL     = r2(s.totalPL + t.net)
    s.totalDays  += t.days_held
    if (t.cagr != null) { s.cagrSum += t.cagr; s.cagrCount++ }
    s.rows.push(t)
  })

  const rows = Object.entries(map)
    .map(([sym, s]) => ({
      sym,
      trades: s.trades,
      winRate: s.wins / s.trades,
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
            <th className="r">Win%</th>
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
                <td className="r num-cell">{fmtPct(r.winRate, 0)}</td>
                <td className={`r num-cell ${r.totalPL >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(r.totalPL)}</td>
                <td className={`r num-cell ${r.avgPL   >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(r.avgPL)}</td>
                <td className="r num-cell muted-cell">{r.avgDays}</td>
                <td className="r num-cell muted-cell">{r.avgCagr != null ? fmtPct(r.avgCagr, 1) : '—'}</td>
              </tr>
              {expanded.has(r.sym) && (
                <tr>
                  <td colSpan={7} style={{ padding: 0, background: 'var(--bg)' }}>
                    <div style={{ padding: '6px 0 10px 32px' }}>
                      <table className="sym-table" style={{ opacity: 0.9 }}>
                        <thead>
                          <tr>
                            <th>Open</th>
                            <th>Close</th>
                            <th className="r">Shares</th>
                            <th className="r">Cost</th>
                            <th className="r">Proceeds</th>
                            <th className="r">Net P&amp;L</th>
                            <th className="r">Perf %</th>
                            <th className="r">Days</th>
                            <th className="r">CAGR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.rows.map(t => (
                            <tr key={t.id}>
                              <td className="num-cell muted-cell">{t.open_date}</td>
                              <td className="num-cell muted-cell">{t.close_date}</td>
                              <td className="r num-cell">{t.shares}</td>
                              <td className="r num-cell muted-cell">{fmtDollar(t.total_buy)}</td>
                              <td className="r num-cell muted-cell">{fmtDollar(t.total_sell)}</td>
                              <td className={`r num-cell ${t.net >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtDollar(t.net)}</td>
                              <td className={`r num-cell ${t.performance >= 0 ? 'gain-cell' : 'loss-cell'}`}>{fmtPct(t.performance)}</td>
                              <td className="r num-cell muted-cell">{t.days_held}</td>
                              <td className="r num-cell muted-cell">{t.cagr != null ? fmtPct(t.cagr, 1) : '—'}</td>
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

export default function Dashboard({ trades, spyData = {}, contributions = [], positions = [], prices = {} }) {
  if (!trades.length) return null

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
  const avgHoldDays  = Math.round(trades.reduce((s, t) => s + t.days_held, 0) / trades.length)
  const totalCapital = r2(trades.reduce((s, t) => s + t.total_buy, 0))
  const returnOnCap  = totalCapital > 0 ? totalPL / totalCapital : 0

  // XIRR — contributions as negative CFs, current portfolio value as final positive CF
  const netContributions = r2(contributions.reduce((s, c) => s + c.amount, 0))
  const unrealizedPL = r2(positions.reduce((s, p) => {
    const price = prices[p.symbol]
    return price != null ? s + (price * p.shares - p.total_buy) : s
  }, 0))
  const portfolioValue = r2(netContributions + totalPL + unrealizedPL)
  const xirrRate = contributions.length >= 1 ? xirr([
    ...contributions.map(c => ({ date: c.date, amount: -c.amount })),
    { date: new Date().toISOString().slice(0, 10), amount: portfolioValue },
  ]) : null

  return (
    <div className="dashboard">

      {/* ── Metrics — Avg Winner & Avg Loser are adjacent in row 2 ── */}
      <div className="metric-grid-8">
        <MetricCard label="Total P&L"         value={fmtDollar(totalPL)}                  variant={totalPL >= 0 ? 'gain' : 'loss'} secondary={<><span className="hl">{trades.length}</span> closed trades</>} />
        <MetricCard label="Win Rate"          value={fmtPct(winRate, 1)}                   secondary={<><span className="hl">{winners.length}</span> of {trades.length} winners</>} />
        <MetricCard label="Profit Factor"     value={pf === Infinity ? '∞' : fmtNum(pf)}  secondary={<>{fmtDollar(totalWin)} won / {fmtDollar(Math.abs(totalLoss))} lost</>} />
        <MetricCard label="Return on Capital"  value={fmtPct(returnOnCap, 2)}              variant={returnOnCap >= 0 ? 'gain' : 'loss'} secondary={<>on <span className="hl">{fmtDollar(totalCapital)}</span> deployed</>} />
        <MetricCard label="Avg Winner"        value={avgWinner != null ? fmtDollar(avgWinner) : '—'} variant="gain" secondary={bestWin  != null ? <>best: <span className="hl">{fmtDollar(bestWin)}</span></>  : null} />
        <MetricCard label="Avg Loser"         value={avgLoser  != null ? fmtDollar(avgLoser)  : '—'} variant="loss" secondary={worstLoss != null ? <>worst: <span className="hl">{fmtDollar(worstLoss)}</span></> : null} />
        <MetricCard label="Open P&L"          value={fmtDollar(unrealizedPL)}              variant={unrealizedPL >= 0 ? 'gain' : 'loss'} secondary="unrealized across positions" />
        <MetricCard label="XIRR"              value={xirrRate != null ? fmtPct(xirrRate, 2) : '—'} variant={xirrRate != null && xirrRate >= 0 ? 'gain' : 'loss'} secondary="annualized return on contributions" />
      </div>

      {/* ── Equity Curve ── */}
      <div className="dash-section">
        <SectionLabel>Equity Curve — Cumulative P&amp;L</SectionLabel>
        <div className="chart-full">
          <EquityCurve trades={trades} spyData={spyData} contributions={contributions} />
        </div>
      </div>

      {/* ── Charts row 1 ── */}
      <div className="dash-section">
        <div className="chart-2col">
          <div className="chart-card">
            <SectionLabel>Monthly P&amp;L</SectionLabel>
            <MonthlyPL trades={trades} />
          </div>
          <div className="chart-card">
            <SectionLabel>Hold Duration vs Return</SectionLabel>
            <HoldScatter trades={trades} />
          </div>
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
