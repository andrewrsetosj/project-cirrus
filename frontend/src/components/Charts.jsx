import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
} from 'chart.js'
import { Bar, Line, Scatter } from 'react-chartjs-2'
import { r2 } from '../utils/compute'

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement,
  LineElement, PointElement,
  Filler, Tooltip
)

// ── Shared constants ────────────────────────────────────────────────────────
const GAIN   = 'rgba(0,212,138,0.75)'
const GAIN_B = '#00d48a'
const LOSS   = 'rgba(255,69,96,0.75)'
const LOSS_B = '#ff4560'
const CYAN   = '#00c8e1'

const barCols    = vals => vals.map(v => v >= 0 ? GAIN : LOSS)
const borderCols = vals => vals.map(v => v >= 0 ? GAIN_B : LOSS_B)

const fmtTip = v => {
  const abs = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (v < 0 ? '  -$' : '  $') + abs
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const tooltipBase = {
  backgroundColor: '#111928',
  borderColor: 'rgba(255,255,255,0.08)',
  borderWidth: 1,
  titleColor: '#7888a4',
  bodyColor: '#dde4f0',
  titleFont: { family: 'Inter', size: 11 },
  bodyFont: { family: 'JetBrains Mono', size: 12 },
  padding: 10,
}

const scaleBase = {
  grid: { color: 'rgba(255,255,255,0.04)' },
  border: { color: 'rgba(255,255,255,0.05)' },
}

const tickBase = {
  color: '#3d5068',
  font: { family: 'Inter', size: 10 },
}

const dollarTick = {
  ...tickBase,
  font: { family: 'JetBrains Mono', size: 10 },
  callback: v => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(),
}

const axisTitle = text => ({
  display: true, text,
  color: '#3d5068',
  font: { family: 'Inter', size: 10, weight: '600' },
})

// ── Equity Curve ─────────────────────────────────────────────────────────────
const SPY_COLOR = '#f5a623'

function findSpyPrice(spyData, dateStr) {
  if (spyData[dateStr] != null) return spyData[dateStr]
  const d = new Date(dateStr + 'T12:00:00Z')
  for (let i = 1; i <= 5; i++) {
    d.setUTCDate(d.getUTCDate() - 1)
    const s = d.toISOString().slice(0, 10)
    if (spyData[s] != null) return spyData[s]
  }
  return null
}

export function EquityCurve({ trades, spyData = {}, contributions = [] }) {
  const sorted = [...trades].sort((a, b) =>
    a.close_date < b.close_date ? -1 : a.close_date > b.close_date ? 1 : a.id - b.id
  )
  let cum = 0
  const data   = sorted.map(t => { cum = r2(cum + t.net); return cum })
  const labels = sorted.map(t => `${t.symbol} · ${t.close_date}`)

  const color = data[data.length - 1] >= 0 ? CYAN : LOSS_B

  // S&P overlay: simulate buying SPY on each contribution date, track P&L vs contributions made so far
  const hasSpy = Object.keys(spyData).length > 0 && sorted.length > 0 && contributions.length > 0
  let spyLine = null
  if (hasSpy) {
    // pre-compute SPY shares bought per contribution
    const spyTranches = contributions
      .filter(c => c.amount > 0)
      .map(c => {
        const price = findSpyPrice(spyData, c.date)
        return price ? { date: c.date, shares: c.amount / price, cost: c.amount } : null
      })
      .filter(Boolean)

    if (spyTranches.length > 0) {
      spyLine = sorted.map(t => {
        const spyNow = findSpyPrice(spyData, t.close_date)
        if (!spyNow) return null
        // only include tranches invested on or before this trade's close date
        const active = spyTranches.filter(tr => tr.date <= t.close_date)
        if (!active.length) return null
        const spyValue = r2(active.reduce((s, tr) => s + tr.shares * spyNow, 0))
        const costSoFar = r2(active.reduce((s, tr) => s + tr.cost, 0))
        return r2(spyValue - costSoFar)
      })
    }
  }

  const spyDataset = spyLine ? [{
    label: 'S&P 500 (SPY)',
    data: spyLine,
    borderColor: SPY_COLOR,
    borderWidth: 1.5,
    borderDash: [4, 3],
    pointRadius: 0,
    pointHoverRadius: 4,
    pointBackgroundColor: SPY_COLOR,
    fill: false,
    tension: 0.35,
    spanGaps: true,
  }] : []

  return (
    <div style={{ height: 220 }}>
      <Line
        data={{
          labels,
          datasets: [
            {
              label: '_equity',
              data,
              borderColor: color,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: data.map((v, i) =>
                i === data.length - 1 ? color : 'transparent'
              ),
              pointBorderColor: color,
              pointHoverRadius: 5,
              fill: true,
              backgroundColor: (ctx) => {
                const chart = ctx.chart
                const { ctx: c, chartArea } = chart
                if (!chartArea) return 'transparent'
                const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
                grad.addColorStop(0, color === CYAN ? 'rgba(0,200,225,0.18)' : 'rgba(255,69,96,0.18)')
                grad.addColorStop(1, 'rgba(0,0,0,0)')
                return grad
              },
              tension: 0.35,
            },
            {
              label: 'Break Even',
              data: Array(data.length).fill(0),
              borderColor: 'rgba(255,255,255,0.28)',
              borderWidth: 1.5,
              borderDash: [6, 5],
              pointRadius: 0,
              pointHoverRadius: 0,
              fill: false,
              tension: 0,
            },
            ...spyDataset,
          ]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600 },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: {
                filter: item => item.text === 'Break Even' || item.text === 'S&P 500 (SPY)',
                color: 'rgba(255,255,255,0.35)',
                font: { family: 'Inter', size: 10 },
                boxWidth: 18,
                boxHeight: 1,
                padding: 8,
              },
            },
            tooltip: {
              ...tooltipBase,
              filter: item => item.dataset.label !== 'Break Even',
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const label = ctx.dataset.label === 'S&P 500 (SPY)' ? '  SPY equiv' : '  Your P&L'
                  return `${label}: ${fmtTip(ctx.parsed.y).trim()}`
                },
              }
            }
          },
          scales: {
            x: {
              ...scaleBase,
              ticks: { ...tickBase, maxRotation: 40, maxTicksLimit: 12 },
            },
            y: {
              ...scaleBase,
              ticks: dollarTick,
              title: axisTitle('Cumulative P&L ($)'),
            }
          }
        }}
      />
    </div>
  )
}

// ── P&L by Symbol ────────────────────────────────────────────────────────────
export function SymbolPL({ trades }) {
  const map = {}
  trades.forEach(t => { map[t.symbol] = r2((map[t.symbol] || 0) + t.net) })
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
  const labels  = entries.map(([s]) => s)
  const data    = entries.map(([, v]) => v)

  return (
    <div style={{ height: 220 }}>
      <Bar
        data={{
          labels,
          datasets: [{
            data,
            backgroundColor: barCols(data),
            borderColor: borderCols(data),
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: false,
          }]
        }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
          plugins: { legend: { display: false }, tooltip: { ...tooltipBase, callbacks: { label: ctx => fmtTip(ctx.parsed.y) } } },
          scales: {
            x: { ...scaleBase, ticks: tickBase },
            y: { ...scaleBase, ticks: dollarTick, title: axisTitle('Net P&L ($)') },
          }
        }}
      />
    </div>
  )
}

// ── Monthly P&L ──────────────────────────────────────────────────────────────
export function MonthlyPL({ trades }) {
  const map = {}
  trades.forEach(t => {
    const m = t.close_date.slice(0, 7)
    map[m] = r2((map[m] || 0) + t.net)
  })
  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  const labels  = entries.map(([m]) => {
    const [y, mo] = m.split('-')
    return `${MONTHS[+mo - 1]} '${y.slice(2)}`
  })
  const data = entries.map(([, v]) => v)

  return (
    <div style={{ height: 220 }}>
      <Bar
        data={{
          labels,
          datasets: [{
            data,
            backgroundColor: barCols(data),
            borderColor: borderCols(data),
            borderWidth: 1,
            borderRadius: 3,
            borderSkipped: false,
          }]
        }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
          plugins: { legend: { display: false }, tooltip: { ...tooltipBase, callbacks: { label: ctx => fmtTip(ctx.parsed.y) } } },
          scales: {
            x: { ...scaleBase, ticks: tickBase },
            y: { ...scaleBase, ticks: dollarTick, title: axisTitle('Net P&L ($)') },
          }
        }}
      />
    </div>
  )
}

// ── Win / Loss by Symbol ──────────────────────────────────────────────────────
export function WinLossChart({ trades }) {
  const map = {}
  trades.forEach(t => {
    if (!map[t.symbol]) map[t.symbol] = { win: 0, loss: 0 }
    if (t.net >= 0) map[t.symbol].win  = r2(map[t.symbol].win  + t.net)
    else            map[t.symbol].loss = r2(map[t.symbol].loss + t.net)
  })
  const syms = Object.keys(map).sort((a, b) =>
    (map[b].win + map[b].loss) - (map[a].win + map[a].loss)
  )

  return (
    <div style={{ height: 220 }}>
      <Bar
        data={{
          labels: syms,
          datasets: [
            {
              label: 'Gains',
              data: syms.map(s => map[s].win),
              backgroundColor: GAIN,
              borderColor: GAIN_B,
              borderWidth: 1,
              borderRadius: 3,
              borderSkipped: false,
            },
            {
              label: 'Losses',
              data: syms.map(s => map[s].loss),
              backgroundColor: LOSS,
              borderColor: LOSS_B,
              borderWidth: 1,
              borderRadius: 3,
              borderSkipped: false,
            },
          ]
        }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: {
                color: '#7888a4',
                font: { family: 'Inter', size: 11 },
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
              }
            },
            tooltip: {
              ...tooltipBase,
              callbacks: { label: ctx => `  ${ctx.dataset.label}: ${fmtTip(ctx.parsed.y).trim()}` }
            }
          },
          scales: {
            x: { ...scaleBase, ticks: tickBase },
            y: { ...scaleBase, ticks: dollarTick, title: axisTitle('P&L ($)') },
          }
        }}
      />
    </div>
  )
}

// ── Hold Days vs Return scatter ───────────────────────────────────────────────
export function HoldScatter({ trades }) {
  const datasets = [
    {
      label: 'Winners',
      data: trades.filter(t => t.net >= 0).map(t => ({ x: t.days_held, y: t.net, sym: t.symbol })),
      backgroundColor: GAIN,
      borderColor: GAIN_B,
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 8,
    },
    {
      label: 'Losers',
      data: trades.filter(t => t.net < 0).map(t => ({ x: t.days_held, y: t.net, sym: t.symbol })),
      backgroundColor: LOSS,
      borderColor: LOSS_B,
      borderWidth: 1,
      pointRadius: 6,
      pointHoverRadius: 8,
    },
  ]

  return (
    <div style={{ height: 220 }}>
      <Scatter
        data={{ datasets }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: {
                color: '#7888a4',
                font: { family: 'Inter', size: 11 },
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
              }
            },
            tooltip: {
              ...tooltipBase,
              callbacks: {
                label: ctx => {
                  const { x, y, sym } = ctx.raw
                  return `  ${sym} · ${x}d held · ${fmtTip(y).trim()}`
                }
              }
            }
          },
          scales: {
            x: { ...scaleBase, ticks: { ...tickBase, callback: v => `${v}d` }, title: axisTitle('Days Held') },
            y: { ...scaleBase, ticks: dollarTick, title: axisTitle('Net P&L ($)') },
          }
        }}
      />
    </div>
  )
}
