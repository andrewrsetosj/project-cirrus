export function fmtDollar(n) {
  if (n == null) return '—'
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + abs
}

export function fmtPct(n, decimals = 2) {
  if (n == null) return '—'
  return (n * 100).toFixed(decimals) + '%'
}

export function fmtNum(n, decimals = 2) {
  if (n == null) return '—'
  return n.toFixed(decimals)
}
