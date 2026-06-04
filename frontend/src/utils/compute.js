export const r2 = n => Math.round(n * 100) / 100

export function xirr(cashflows) {
  // cashflows: [{date: 'YYYY-MM-DD', amount: number}, ...]
  // contributions = negative amounts (money going in), current value = positive
  if (!cashflows || cashflows.length < 2) return null
  const ms = cashflows.map(cf => new Date(cf.date + 'T12:00:00Z').getTime())
  const amounts = cashflows.map(cf => cf.amount)
  const t0 = Math.min(...ms)
  const years = ms.map(d => (d - t0) / (365.25 * 24 * 3600 * 1000))

  const npv  = r => amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, years[i]), 0)
  const dnpv = r => amounts.reduce((s, a, i) => s - years[i] * a / Math.pow(1 + r, years[i] + 1), 0)

  let r = 0.1
  for (let i = 0; i < 300; i++) {
    const f = npv(r), df = dnpv(r)
    if (Math.abs(df) < 1e-12) break
    const rNew = r - f / df
    if (rNew <= -1) return null
    if (Math.abs(rNew - r) < 1e-9) { r = rNew; break }
    r = rNew
  }
  return isFinite(r) ? r : null
}

export function tradeCategory(days) {
  if (days <= 1)   return 'Day'
  if (days <= 30)  return 'Swing'
  if (days <= 365) return 'Position'
  return 'Long-term'
}

export function computeFields(t) {
  t.buy_price  = r2(t.total_buy  / t.shares)
  t.sell_price = r2(t.total_sell / t.shares)
  t.net        = r2(t.total_sell - t.total_buy)
  t.gain_per_sh = r2(t.sell_price - t.buy_price)

  const [oy, om, od] = t.open_date.split('-').map(Number)
  const [cy, cm, cd] = t.close_date.split('-').map(Number)
  t.days_held = Math.round((new Date(cy, cm - 1, cd) - new Date(oy, om - 1, od)) / 86400000)
  t.category  = tradeCategory(t.days_held)

  t.performance = t.net / t.total_buy

  if (t.days_held > 0) {
    t.cagr           = Math.pow(t.total_sell / t.total_buy, 365 / t.days_held) - 1
    t.day_pct_change = t.performance / t.days_held
    t.rot            = r2(t.net / t.days_held)
  } else {
    t.cagr = t.day_pct_change = t.rot = null
  }

  return t
}
