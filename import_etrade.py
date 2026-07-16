"""Import an E*TRADE 'DownloadTxnHistory.csv' export into trades.db.

Maps activity rows onto Cirrus tables, all stamped with an account (default: brokerage):
  Bought / Sold      -> FIFO lot matching: closed round-trips into `trades`,
                        unsold lots into `open_positions`. A sell that spans
                        multiple buy lots becomes one trade row per lot, with
                        proceeds allocated pro-rata by shares.
  Online Transfer /
  Deposit            -> `contributions`
  Interest Income    -> `income_log` (as a cumulative snapshot, matching how
                        the Income card reads the latest entry)

Dry-run by default; pass --apply to write. Refuses to apply into an account
that already has rows unless --force is given (to avoid duplicate imports).

Usage:
  python import_etrade.py ~/Downloads/DownloadTxnHistory.csv            # preview
  python import_etrade.py ~/Downloads/DownloadTxnHistory.csv --apply    # write
"""
import argparse
import csv
import os
import sqlite3
import sys
from collections import defaultdict, deque

DB = os.path.join(os.path.dirname(__file__), 'trades.db')

CASH_TYPES = ('Online Transfer', 'Deposit')


def iso_date(mdy):
    m, d, y = mdy.strip().split('/')
    return f'20{y}-{m}-{d}'


def parse_rows(path):
    """Yield dict rows from the export, skipping preamble and footer junk."""
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = None
        for row in reader:
            if not header:
                if row and row[0].startswith('Activity/Trade Date'):
                    header = row
                continue
            if not row or not row[0].strip():
                break  # blank line ends the data section; disclaimers follow
            yield dict(zip(header, row))


def r2(x):
    return round(x + 1e-9, 2)


def build(path, account):
    contributions, income, buys, sells = [], [], [], []

    for row in parse_rows(path):
        atype  = row['Activity Type'].strip()
        date   = iso_date(row['Activity/Trade Date'])
        amount = float(row['Amount $'])
        if atype in CASH_TYPES:
            contributions.append({'date': date, 'amount': r2(amount), 'note': 'E*TRADE import'})
        elif atype == 'Interest Income':
            income.append({'date': date, 'amount': r2(amount), 'note': 'E*TRADE interest'})
        elif atype in ('Bought', 'Sold'):
            qty = float(row['Quantity #'])
            if qty != int(qty):
                sys.exit(f'Fractional share quantity {qty} on {date} {row["Symbol"]} — '
                         'trades.shares is an integer column; handle this row manually.')
            rec = {'symbol': row['Symbol'].strip().upper(), 'date': date,
                   'shares': abs(int(qty)), 'amount': abs(amount)}
            (buys if atype == 'Bought' else sells).append(rec)
        # anything else (fees, dividends-reinvested, etc.) is ignored; extend as needed

    # FIFO matching: chronological, buys before sells within a day
    events = ([(b['date'], 0, 'buy', b) for b in buys] +
              [(s['date'], 1, 'sell', s) for s in sells])
    events.sort(key=lambda e: (e[0], e[1]))

    lots = defaultdict(deque)   # symbol -> deque of {date, shares, cost}
    trades = []
    for _, _, kind, ev in events:
        sym = ev['symbol']
        if kind == 'buy':
            lots[sym].append({'date': ev['date'], 'shares': ev['shares'], 'cost': ev['amount']})
            continue
        remaining, proceeds_per_share = ev['shares'], ev['amount'] / ev['shares']
        while remaining > 0:
            if not lots[sym]:
                sys.exit(f'Sell of {remaining} {sym} on {ev["date"]} has no matching buy lot — '
                         'the export window may not cover the original purchase.')
            lot = lots[sym][0]
            take = min(remaining, lot['shares'])
            cost = lot['cost'] * take / lot['shares']
            trades.append({
                'symbol': sym, 'open_date': lot['date'], 'close_date': ev['date'],
                'shares': take, 'total_buy': r2(cost), 'total_sell': r2(proceeds_per_share * take),
            })
            lot['shares'] -= take
            lot['cost']   -= cost
            if lot['shares'] == 0:
                lots[sym].popleft()
            remaining -= take

    positions = [{'symbol': sym, 'open_date': lot['date'],
                  'shares': lot['shares'], 'total_buy': r2(lot['cost'])}
                 for sym, q in sorted(lots.items()) for lot in q]

    # income entries are cumulative snapshots in Cirrus
    income.sort(key=lambda e: e['date'])
    running = 0.0
    for e in income:
        running = r2(running + e['amount'])
        e['amount'] = running

    return contributions, income, trades, positions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_path')
    ap.add_argument('--account', default='brokerage', choices=['ira', 'brokerage'])
    ap.add_argument('--apply', action='store_true', help='write to trades.db (default: dry run)')
    ap.add_argument('--force', action='store_true', help='allow importing into a non-empty account')
    args = ap.parse_args()

    contributions, income, trades, positions = build(args.csv_path, args.account)

    print(f'Parsed {args.csv_path} -> account "{args.account}":\n')
    print(f'  contributions: {len(contributions)}  (net {r2(sum(c["amount"] for c in contributions)):+})')
    for c in contributions:
        print(f'    {c["date"]}  {c["amount"]:>10,.2f}')
    print(f'  closed trades: {len(trades)}')
    for t in trades:
        net = r2(t['total_sell'] - t['total_buy'])
        print(f'    {t["symbol"]:<5} {t["open_date"]} -> {t["close_date"]}  {t["shares"]:>3} sh  '
              f'buy {t["total_buy"]:>10,.2f}  sell {t["total_sell"]:>10,.2f}  net {net:+,.2f}')
    print(f'  open positions: {len(positions)}')
    for p in positions:
        print(f'    {p["symbol"]:<5} {p["open_date"]}  {p["shares"]:>3} sh  cost {p["total_buy"]:>10,.2f}')
    print(f'  income snapshots: {len(income)}')
    for e in income:
        print(f'    {e["date"]}  cumulative {e["amount"]:,.2f}')

    if not args.apply:
        print('\nDry run — nothing written. Re-run with --apply to import.')
        return

    conn = sqlite3.connect(DB)
    existing = sum(conn.execute(f'SELECT COUNT(*) FROM {t} WHERE account = ?',
                                (args.account,)).fetchone()[0]
                   for t in ('trades', 'open_positions', 'contributions', 'income_log'))
    if existing and not args.force:
        conn.close()
        sys.exit(f'\nAccount "{args.account}" already has {existing} rows — pass --force to append anyway '
                 f'(or clear it first: DELETE FROM <table> WHERE account=\'{args.account}\').')

    conn.executemany(
        'INSERT INTO contributions (date, amount, note, account) VALUES (?,?,?,?)',
        [(c['date'], c['amount'], c['note'], args.account) for c in contributions])
    conn.executemany(
        'INSERT INTO income_log (date, amount, note, account) VALUES (?,?,?,?)',
        [(e['date'], e['amount'], e['note'], args.account) for e in income])
    conn.executemany(
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell, account) '
        'VALUES (?,?,?,?,?,?,?)',
        [(t['symbol'], t['open_date'], t['close_date'], t['shares'],
          t['total_buy'], t['total_sell'], args.account) for t in trades])
    conn.executemany(
        'INSERT INTO open_positions (symbol, open_date, shares, total_buy, account) VALUES (?,?,?,?,?)',
        [(p['symbol'], p['open_date'], p['shares'], p['total_buy'], args.account) for p in positions])
    conn.commit()
    conn.close()
    print(f'\nImported into account "{args.account}".')


if __name__ == '__main__':
    main()
