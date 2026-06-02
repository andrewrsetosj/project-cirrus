export const r2 = n => Math.round(n * 100) / 100

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
