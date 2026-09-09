"""Daily portfolio time series and the risk statistics derived from it.

Everything here is a pure function over plain dicts and lists — no database, no
network — so it can be tested directly. app.py loads the rows and hands them in.

The value definition matches the dashboard's Account Value card:

    value(d) = contributions(<=d) + realized(<=d) + income(<=d) + unrealized(d)

Returns are time-weighted: each day's return removes that day's external cash
flow, so deposits neither create nor destroy apparent performance. That is the
number that answers "how good is my stock picking", as opposed to XIRR, which
answers "how did my money actually do, deposit timing included".
"""
from math import sqrt

TRADING_DAYS = 252


def forward_filled(history, days):
    """Map each day to the most recent close at or before it.

    Gaps (holidays, halted symbols, data holes) carry the last known price
    forward. Days before the first close have no price and are omitted.
    """
    if not history:
        return {}
    out, last = {}, None
    known = set(history)
    for day in days:
        if day in known:
            last = history[day]
        if last is not None:
            out[day] = last
    return out


def unadjust_splits(history, splits):
    """Restore split-adjusted closes to the share terms actually traded.

    Yahoo restates every historical close after a split, so a pre-split close
    comes back divided by the ratio. Trades record shares as they were bought, so
    marking a pre-split lot against a post-split price understates it by exactly
    that ratio — a 4:1 split makes a holding look like it lost 75%.

    `splits` maps effective date -> ratio (4.0 for a 4:1). Each close is scaled by
    the ratios of every split that took effect after it.
    """
    if not splits:
        return dict(history)
    effective = sorted(splits.items())
    out = {}
    for date, close in history.items():
        factor = 1.0
        for split_date, ratio in effective:
            if split_date > date:
                factor *= ratio
        out[date] = close * factor
    return out


def holdings_on(day, positions, trades):
    """Every lot held at the close of `day`.

    A position counts once its open_date has arrived. A closed trade counts on
    the days between its open and close; on close_date itself the proceeds are
    realized instead, so it drops out.
    """
    held = [p for p in positions if p['open_date'] <= day]
    held += [t for t in trades if t['open_date'] <= day < t['close_date']]
    return held


def build_daily_series(days, positions, trades, contributions, income, prices):
    """One row per day: value, and the parts it is built from.

    `prices` maps symbol -> {date: close} and is forward-filled internally.
    Lots whose symbol has no price yet contribute their cost basis rather than a
    market value, so an unpriced holding reads as flat instead of vanishing.
    """
    days = sorted(days)
    filled = {sym: forward_filled(hist, days) for sym, hist in prices.items()}

    contrib_by_day, income_by_day, realized_by_day = {}, {}, {}
    for c in contributions:
        contrib_by_day[c['date']] = contrib_by_day.get(c['date'], 0.0) + c['amount']
    for e in income:
        income_by_day[e['date']] = income_by_day.get(e['date'], 0.0) + e['amount']
    for t in trades:
        gain = t['total_sell'] - t['total_buy']
        realized_by_day[t['close_date']] = realized_by_day.get(t['close_date'], 0.0) + gain

    series = []
    contributed = realized = earned = 0.0
    for day in days:
        contributed += contrib_by_day.get(day, 0.0)
        realized    += realized_by_day.get(day, 0.0)
        earned      += income_by_day.get(day, 0.0)

        market = cost = 0.0
        for lot in holdings_on(day, positions, trades):
            cost += lot['total_buy']
            price = filled.get(lot['symbol'], {}).get(day)
            market += price * lot['shares'] if price is not None else lot['total_buy']

        series.append({
            'date': day,
            'value': round(contributed + realized + earned + (market - cost), 2),
            'contributed': round(contributed, 2),
            'realized': round(realized, 2),
            'income': round(earned, 2),
            'unrealized': round(market - cost, 2),
            'flow': round(contrib_by_day.get(day, 0.0), 2),
        })
    return series


def daily_returns(series):
    """Time-weighted daily returns: the day's flow is removed before comparing.

    A day whose starting value is non-positive has no meaningful return (there is
    nothing invested to earn one) and is skipped.
    """
    out = []
    for prev, cur in zip(series, series[1:]):
        base = prev['value']
        if base <= 0:
            continue
        out.append((cur['value'] - cur['flow']) / base - 1.0)
    return out


def growth_index(series):
    """Cumulative time-weighted growth of 1.0 — the flow-neutral equity curve.

    Drawdown must be measured on this, not on raw value: a deposit raises value
    without being a gain, and would otherwise erase a real decline.
    """
    # Starts at 1.0 so a fall on the very first day is measured from the opening
    # level rather than from the already-fallen one.
    level = 1.0
    index = [level]
    for r in daily_returns(series):
        level *= (1.0 + r)
        index.append(level)
    return index


def max_drawdown(index):
    """Deepest peak-to-trough fall of the growth index, as a negative fraction."""
    peak, worst = None, 0.0
    for level in index:
        peak = level if peak is None else max(peak, level)
        if peak > 0:
            worst = min(worst, level / peak - 1.0)
    return worst


def _stdev(xs):
    if len(xs) < 2:
        return 0.0
    mean = sum(xs) / len(xs)
    return sqrt(sum((x - mean) ** 2 for x in xs) / (len(xs) - 1))


def beta(portfolio, benchmark):
    """Sensitivity to the benchmark, over the overlapping tail of both series."""
    n = min(len(portfolio), len(benchmark))
    if n < 2:
        return None
    a, b = portfolio[-n:], benchmark[-n:]
    mean_a, mean_b = sum(a) / n, sum(b) / n
    var_b = sum((x - mean_b) ** 2 for x in b) / (n - 1)
    if var_b == 0:
        return None
    cov = sum((a[i] - mean_a) * (b[i] - mean_b) for i in range(n)) / (n - 1)
    return cov / var_b


# Compounding a few days of return out to a full year produces nonsense (a 4-day
# double annualizes to 2**84), so CAGR is withheld until there is enough history.
MIN_DAYS_TO_ANNUALIZE = 30


def performance_stats(series, benchmark_returns=None, risk_free=0.0):
    """Risk/return summary. `risk_free` is an annual rate, e.g. 0.04 for 4%.

    Sharpe and Sortino use the annualized *mean* daily excess return over
    annualized volatility — the standard definition, and stable on short windows
    where a compounded CAGR would blow up.
    """
    rets = daily_returns(series)
    if not rets:
        return {'days': len(series), 'twr': None, 'twr_annualized': None,
                'volatility': None, 'sharpe': None, 'sortino': None,
                'max_drawdown': None, 'beta': None, 'best_day': None, 'worst_day': None}

    index = growth_index(series)
    total = index[-1] - 1.0

    annualized = None
    if len(rets) >= MIN_DAYS_TO_ANNUALIZE and index[-1] > 0:
        annualized = index[-1] ** (TRADING_DAYS / len(rets)) - 1.0

    vol      = _stdev(rets) * sqrt(TRADING_DAYS)
    downside = _stdev([r for r in rets if r < 0]) * sqrt(TRADING_DAYS)
    excess   = (sum(rets) / len(rets)) * TRADING_DAYS - risk_free

    return {
        'days': len(series),
        'twr': total,
        'twr_annualized': annualized,
        'volatility': vol,
        'sharpe': (excess / vol) if vol > 0 else None,
        'sortino': (excess / downside) if downside > 0 else None,
        'max_drawdown': max_drawdown(index),
        'beta': beta(rets, benchmark_returns) if benchmark_returns else None,
        'best_day': max(rets),
        'worst_day': min(rets),
    }


def simulate_fund(days, contributions, history, first_invest_date=None, clamped=False):
    """Daily value of putting every contribution into one fund instead.

    `history` should be the dividend-adjusted series so the fund earns total
    return. When `clamped`, contributions predating the first investment buy at
    that date rather than their own.
    """
    days = sorted(days)
    filled = forward_filled(history, days)
    if not filled:
        return []

    tranches = []
    for c in contributions:
        buy_on = c['date']
        if clamped and first_invest_date and buy_on < first_invest_date:
            buy_on = first_invest_date
        price = filled.get(buy_on)
        if price:
            tranches.append({'date': buy_on, 'shares': c['amount'] / price,
                             'cost': c['amount']})

    out, shares, cost, i = [], 0.0, 0.0, 0
    ordered = sorted(tranches, key=lambda t: t['date'])
    for day in days:
        added = 0.0
        while i < len(ordered) and ordered[i]['date'] <= day:
            shares += ordered[i]['shares']
            cost   += ordered[i]['cost']
            added  += ordered[i]['cost']
            i += 1
        price = filled.get(day)
        if price is None:
            continue
        # `flow` mirrors the portfolio series so the benchmark's time-weighted
        # return is computed the same way — a deposit is not a gain here either.
        out.append({'date': day, 'value': round(shares * price, 2),
                    'contributed': round(cost, 2), 'flow': round(added, 2)})
    return out
