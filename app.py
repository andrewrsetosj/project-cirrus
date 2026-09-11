from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
import sqlite3
import os
import urllib.request
import urllib.parse
import json as _json
import ssl
import threading
import time as _time
from datetime import datetime as _dt, timezone as _tz
from concurrent.futures import ThreadPoolExecutor
import anthropic as _anthropic
import analytics
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from datetime import date as _date
from plaid.model.products import Products
from plaid.model.country_code import CountryCode

_claude = _anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

# Share counts are stored as REAL, so arithmetic like 13.972 - 13 leaves binary
# float noise (0.9719999999999995). Brokerages quote fractional shares to at most
# 6 decimals, so round to 8 and treat anything under SHARE_EPS as zero.
SHARE_DP = 8
SHARE_EPS = 1e-8


def parse_shares(value):
    """Parse a user-supplied share count, rounded free of float noise."""
    return round(float(value), SHARE_DP)


# Ledger dollar amounts are accumulated and differenced, so they get snapped to
# whole cents on the way in. Market prices are multiplied rather than summed and
# keep their full precision.
MONEY_DP = 2


def parse_money(value):
    """Parse a user-supplied dollar amount, snapped to whole cents."""
    return round(float(value), MONEY_DP)

_plaid_cfg = plaid.Configuration(
    host=plaid.Environment.Production,
    api_key={
        'clientId': os.environ.get('PLAID_CLIENT_ID', ''),
        'secret':   os.environ.get('PLAID_SECRET', ''),
    }
)
_plaid = plaid_api.PlaidApi(plaid.ApiClient(_plaid_cfg))

def _load_plaid_token():
    conn = get_db()
    row = conn.execute("SELECT value FROM kv WHERE key='plaid_access_token'").fetchone()
    conn.close()
    return row['value'] if row else None

def _save_plaid_token(token):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('plaid_access_token', ?)", (token,))
    conn.commit()
    conn.close()

_plaid_access_token = None

def _init_plaid_token():
    global _plaid_access_token
    try:
        _plaid_access_token = _load_plaid_token()
    except Exception:
        pass


app = Flask(__name__, static_folder='static', static_url_path='')
DB = os.path.join(os.path.dirname(__file__), 'trades.db')


def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id         INTEGER PRIMARY KEY,
            symbol     TEXT NOT NULL,
            open_date  TEXT NOT NULL,
            close_date TEXT NOT NULL,
            shares     REAL NOT NULL,
            total_buy  REAL NOT NULL,
            total_sell REAL NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS open_positions (
            id        INTEGER PRIMARY KEY,
            symbol    TEXT NOT NULL,
            open_date TEXT NOT NULL,
            shares    REAL NOT NULL,
            total_buy REAL NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS checkpoints (
            id              INTEGER PRIMARY KEY,
            symbol          TEXT NOT NULL,
            name            TEXT NOT NULL DEFAULT '',
            price           REAL NOT NULL,
            checkpointed_at TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS contributions (
            id     INTEGER PRIMARY KEY,
            date   TEXT NOT NULL,
            amount REAL NOT NULL,
            note   TEXT NOT NULL DEFAULT ''
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS kv (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS income_log (
            id     INTEGER PRIMARY KEY,
            date   TEXT NOT NULL,
            amount REAL NOT NULL,
            note   TEXT NOT NULL DEFAULT ''
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS market_cache (
            symbol TEXT NOT NULL,
            date   TEXT NOT NULL,
            close  REAL NOT NULL,
            PRIMARY KEY (symbol, date)
        )
    ''')
    # account column ('ira' | 'brokerage') on money-scoped tables; existing rows
    # default to 'ira'. checkpoints/market_cache stay global.
    for table in ('trades', 'open_positions', 'contributions', 'income_log'):
        cols = [r[1] for r in conn.execute(f'PRAGMA table_info({table})')]
        if cols and 'account' not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN account TEXT NOT NULL DEFAULT 'ira'")
    # adj_close = dividend-adjusted close, used for total-return benchmarks. Rows
    # cached before this column existed have NULL and get re-fetched on demand.
    mc_cols = [r[1] for r in conn.execute('PRAGMA table_info(market_cache)')]
    if 'adj_close' not in mc_cols:
        conn.execute('ALTER TABLE market_cache ADD COLUMN adj_close REAL')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS market_splits (
            symbol TEXT NOT NULL,
            date   TEXT NOT NULL,
            ratio  REAL NOT NULL,
            PRIMARY KEY (symbol, date)
        )
    ''')
    conn.commit()
    conn.close()


ACCOUNTS = ('ira', 'brokerage')


def account_filter():
    """Account from query string: 'ira'/'brokerage' filters, anything else (or absent) = all."""
    acct = (request.args.get('account') or 'all').lower()
    return acct if acct in ACCOUNTS else None


def body_account(data):
    """Account for new rows, from the request body. Defaults to 'ira'."""
    acct = (data.get('account') or 'ira').lower()
    return acct if acct in ACCOUNTS else 'ira'


# ── Static / index ────────────────────────────────────────────────────────────

@app.get('/')
def index():
    return send_from_directory('static', 'index.html')


# ── Closed trades ─────────────────────────────────────────────────────────────

@app.get('/trades')
def get_trades():
    acct = account_filter()
    conn = get_db()
    rows = (conn.execute('SELECT * FROM trades WHERE account = ? ORDER BY id ASC', (acct,))
            if acct else
            conn.execute('SELECT * FROM trades ORDER BY id ASC')).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/trades')
def add_trade():
    data = request.get_json(silent=True) or {}
    required = ('symbol', 'open_date', 'close_date', 'shares', 'total_buy', 'total_sell')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    conn = get_db()
    cur = conn.execute(
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell, account) VALUES (?,?,?,?,?,?,?)',
        (data['symbol'].upper(), data['open_date'], data['close_date'],
         parse_shares(data['shares']), parse_money(data['total_buy']), parse_money(data['total_sell']), body_account(data))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM trades WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.put('/trades/<int:trade_id>')
def update_trade(trade_id):
    data = request.get_json(silent=True) or {}
    required = ('symbol', 'open_date', 'close_date', 'shares', 'total_buy', 'total_sell')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    conn = get_db()
    cur = conn.execute(
        '''UPDATE trades SET symbol=?, open_date=?, close_date=?, shares=?, total_buy=?, total_sell=?
           WHERE id=?''',
        (data['symbol'].upper(), data['open_date'], data['close_date'],
         parse_shares(data['shares']), parse_money(data['total_buy']), parse_money(data['total_sell']), trade_id)
    )
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Trade not found'}), 404
    row = conn.execute('SELECT * FROM trades WHERE id=?', (trade_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.delete('/trades/<int:trade_id>')
def delete_trade(trade_id):
    conn = get_db()
    cur = conn.execute('DELETE FROM trades WHERE id = ?', (trade_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'error': 'Trade not found'}), 404
    return '', 204


# ── Open positions ─────────────────────────────────────────────────────────────

@app.get('/positions')
def get_positions():
    acct = account_filter()
    conn = get_db()
    rows = (conn.execute('SELECT * FROM open_positions WHERE account = ? ORDER BY open_date ASC', (acct,))
            if acct else
            conn.execute('SELECT * FROM open_positions ORDER BY open_date ASC')).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/positions')
def add_position():
    data = request.get_json(silent=True) or {}
    required = ('symbol', 'open_date', 'shares', 'total_buy')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    conn = get_db()
    cur = conn.execute(
        'INSERT INTO open_positions (symbol, open_date, shares, total_buy, account) VALUES (?,?,?,?,?)',
        (data['symbol'].upper(), data['open_date'], parse_shares(data['shares']), parse_money(data['total_buy']), body_account(data))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM open_positions WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.put('/positions/<int:pos_id>')
def update_position(pos_id):
    data = request.get_json(silent=True) or {}
    required = ('symbol', 'open_date', 'shares', 'total_buy')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    conn = get_db()
    cur = conn.execute(
        'UPDATE open_positions SET symbol=?, open_date=?, shares=?, total_buy=? WHERE id=?',
        (data['symbol'].upper(), data['open_date'],
         parse_shares(data['shares']), parse_money(data['total_buy']), pos_id)
    )
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Position not found'}), 404
    row = conn.execute('SELECT * FROM open_positions WHERE id=?', (pos_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.delete('/positions/<int:pos_id>')
def delete_position(pos_id):
    conn = get_db()
    cur = conn.execute('DELETE FROM open_positions WHERE id = ?', (pos_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'error': 'Position not found'}), 404
    return '', 204


LOT_METHODS = ('fifo', 'lifo')


def _consume_lot(conn, pos, sell_shares, close_date, total_sell):
    """Sell `sell_shares` out of one open lot: write the realized trade row, then
    shrink the lot or delete it if nothing is left. Caller owns the commit.

    Cost basis for the sold shares is allocated proportionally (average cost),
    snapped to whole cents. The remainder left on the lot is computed as
    total - allocated rather than re-derived, so the two always sum back to the
    original basis and repeated partial sells cannot drift.
    """
    allocated_buy = round(pos['total_buy'] * sell_shares / pos['shares'], MONEY_DP)

    cur = conn.execute(
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell, account) VALUES (?,?,?,?,?,?,?)',
        (pos['symbol'], pos['open_date'], close_date,
         sell_shares, allocated_buy, total_sell, pos.get('account', 'ira'))
    )

    remaining_shares = round(pos['shares'] - sell_shares, SHARE_DP)
    if remaining_shares <= SHARE_EPS:
        conn.execute('DELETE FROM open_positions WHERE id = ?', (pos['id'],))
    else:
        conn.execute(
            'UPDATE open_positions SET shares = ?, total_buy = ? WHERE id = ?',
            (remaining_shares, round(pos['total_buy'] - allocated_buy, MONEY_DP), pos['id'])
        )
    return cur.lastrowid


def _allocate_lots(lots, sell_shares, total_sell):
    """Match `sell_shares` against `lots` in order, returning [(lot, shares, proceeds)].

    Proceeds are split pro-rata by shares taken, with the final lot absorbing the
    rounding residual so the per-lot amounts always sum back to exactly
    `total_sell` instead of landing a cent off.
    """
    picks = []
    remaining = sell_shares
    for lot in lots:
        if remaining <= SHARE_EPS:
            break
        take = min(remaining, lot['shares'])
        # A lot left holding less than SHARE_EPS could never be sold afterwards,
        # so absorb the sliver into this sale rather than stranding it.
        if lot['shares'] - take <= SHARE_EPS:
            take = lot['shares']
        take = round(take, SHARE_DP)
        picks.append((lot, take))
        remaining = round(remaining - take, SHARE_DP)

    taken = round(sum(t for _, t in picks), SHARE_DP)
    out, allocated = [], 0.0
    for idx, (lot, take) in enumerate(picks):
        if idx == len(picks) - 1:
            amount = round(total_sell - allocated, MONEY_DP)
        else:
            amount = round(total_sell * take / taken, MONEY_DP)
            allocated = round(allocated + amount, MONEY_DP)
        out.append((lot, take, amount))
    return out


@app.post('/positions/sell')
def sell_symbol():
    """Sell a share quantity of one symbol, spanning as many lots as it takes.

    The single-lot endpoint below can only sell what one lot holds, so a sale of
    17 shares split across a 13.46-share lot and a 3.91-share lot had no way to
    be recorded. Lots are matched in `method` order (FIFO default) and each one
    consumed writes its own trade row, preserving that lot's open_date so
    days-held and CAGR stay correct per lot. The whole fan-out is one
    transaction, so a failure part-way cannot leave the ledger half-closed.
    """
    data = request.get_json(silent=True) or {}
    required = ('symbol', 'close_date', 'shares', 'total_sell')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    method = (data.get('method') or 'fifo').lower()
    if method not in LOT_METHODS:
        return jsonify({'error': f'method must be one of: {", ".join(LOT_METHODS)}'}), 400

    try:
        sell_shares = parse_shares(data['shares'])
        total_sell = parse_money(data['total_sell'])
    except (TypeError, ValueError):
        return jsonify({'error': 'shares and total_sell must be numbers'}), 400
    if sell_shares <= 0:
        return jsonify({'error': 'shares must be greater than 0'}), 400

    symbol = data['symbol'].upper()
    acct = (data.get('account') or '').lower()

    conn = get_db()
    # Oldest lot first; id breaks ties between lots opened the same day.
    if acct in ACCOUNTS:
        rows = conn.execute(
            'SELECT * FROM open_positions WHERE symbol = ? AND account = ? ORDER BY open_date ASC, id ASC',
            (symbol, acct)).fetchall()
    else:
        rows = conn.execute(
            'SELECT * FROM open_positions WHERE symbol = ? ORDER BY open_date ASC, id ASC',
            (symbol,)).fetchall()
    lots = [dict(r) for r in rows]
    if not lots:
        conn.close()
        return jsonify({'error': f'No open {symbol} position'}), 404
    if method == 'lifo':
        lots.reverse()

    # Compare with tolerance: share counts are floats, so a total held that lands
    # at 17.369999999999997 must still accept a sell of 17.37.
    held = round(sum(lot['shares'] for lot in lots), SHARE_DP)
    if sell_shares - held > SHARE_EPS:
        conn.close()
        return jsonify({'error': f'{symbol} has only {held} shares open'}), 400
    sell_shares = min(sell_shares, held)

    trade_ids = [
        _consume_lot(conn, lot, take, data['close_date'], amount)
        for lot, take, amount in _allocate_lots(lots, sell_shares, total_sell)
    ]
    conn.commit()
    placeholders = ','.join('?' * len(trade_ids))
    trades = [dict(r) for r in conn.execute(
        f'SELECT * FROM trades WHERE id IN ({placeholders}) ORDER BY id ASC', trade_ids)]
    conn.close()
    return jsonify(trades), 201


@app.post('/positions/<int:pos_id>/close')
def close_position(pos_id):
    data = request.get_json(silent=True) or {}
    required = ('close_date', 'total_sell')
    missing = [f for f in required if f not in data or data[f] == '']
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    conn = get_db()
    pos = conn.execute('SELECT * FROM open_positions WHERE id = ?', (pos_id,)).fetchone()
    if not pos:
        conn.close()
        return jsonify({'error': 'Position not found'}), 404

    pos = dict(pos)

    # Optional partial close: sell only `shares` of the position, leaving the rest open.
    sell_shares = pos['shares']
    if 'shares' in data and data['shares'] != '':
        try:
            sell_shares = parse_shares(data['shares'])
        except (TypeError, ValueError):
            conn.close()
            return jsonify({'error': 'shares must be a number'}), 400
        # Compare with tolerance: share counts are floats, so a remainder stored
        # as 0.9719999999999995 must still accept a sell of 0.972.
        if sell_shares <= 0 or sell_shares - pos['shares'] > SHARE_EPS:
            conn.close()
            return jsonify({'error': f'shares must be between 1 and {pos["shares"]}'}), 400
        sell_shares = min(sell_shares, pos['shares'])

    trade_id = _consume_lot(conn, pos, sell_shares, data['close_date'], parse_money(data['total_sell']))
    conn.commit()
    trade = conn.execute('SELECT * FROM trades WHERE id = ?', (trade_id,)).fetchone()
    conn.close()
    return jsonify(dict(trade)), 201


# ── Checkpoints ──────────────────────────────────────────────────────────────

@app.get('/checkpoints')
def get_checkpoints():
    conn = get_db()
    rows = conn.execute('SELECT * FROM checkpoints ORDER BY checkpointed_at DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/checkpoints')
def add_checkpoint():
    data = request.get_json(silent=True) or {}
    if not data.get('symbol') or data.get('price') is None:
        return jsonify({'error': 'Missing symbol or price'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO checkpoints (symbol, name, price, checkpointed_at) VALUES (?,?,?,?)',
        (data['symbol'].upper(), data.get('name', ''), float(data['price']),
         _dt.now(_tz.utc).isoformat())
    )
    conn.commit()
    row = conn.execute('SELECT * FROM checkpoints WHERE id=?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.delete('/checkpoints/<int:cp_id>')
def delete_checkpoint(cp_id):
    conn = get_db()
    cur = conn.execute('DELETE FROM checkpoints WHERE id=?', (cp_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'error': 'Not found'}), 404
    return '', 204


# ── Bulk market prices ───────────────────────────────────────────────────────

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode    = ssl.CERT_NONE
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
}

def _chart_price(sym):
    """Single-symbol price via v8/finance/chart (used by /quote endpoint)."""
    try:
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=2d'
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=8, context=_SSL) as r:
            payload = _json.loads(r.read())
        meta  = payload['chart']['result'][0]['meta']
        price = round(float(meta['regularMarketPrice']), 2)
        prev  = meta.get('regularMarketPreviousClose') or meta.get('previousClose') or meta.get('chartPreviousClose')
        prev  = round(float(prev), 2) if prev else price
        chg   = round((price - prev) / prev * 100, 2) if prev > 0 else 0.0
        return {'price': price, 'prev_close': prev, 'change_pct': chg}
    except Exception:
        return None

def _spark_batch(syms):
    """Fetch up to 20 symbols via spark API. Uses regularMarketChangePercent from meta
    when present; falls back to computing from the unadjusted time-series closes."""
    try:
        url = ('https://query1.finance.yahoo.com/v7/finance/spark?symbols='
               + ','.join(syms) + '&range=5d&interval=1d')
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=12, context=_SSL) as r:
            d = _json.loads(r.read())
        result = {}
        for item in (d['spark'].get('result') or []):
            sym  = item['symbol']
            resp = (item.get('response') or [{}])[0]
            meta = resp.get('meta', {})
            price = meta.get('regularMarketPrice')
            if not price:
                continue
            price = float(price)

            chg_pct = meta.get('regularMarketChangePercent')
            if chg_pct is not None:
                change_pct = round(float(chg_pct), 2)
            else:
                closes_raw = (resp.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
                closes = [c for c in closes_raw if c is not None]
                prev = closes[-2] if len(closes) >= 2 else None
                change_pct = round((price - prev) / prev * 100, 2) if prev else 0.0

            result[sym] = {'price': round(price, 2), 'change_pct': change_pct}
        return result
    except Exception:
        return {}

def _history_batch(syms):
    """Fetch 1y weekly closes for up to 20 symbols, return week/month/year % vs current price."""
    try:
        url = ('https://query1.finance.yahoo.com/v7/finance/spark?symbols='
               + ','.join(syms) + '&range=1y&interval=1d')
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
            data = _json.loads(r.read())

        result = {}
        for item in (data['spark'].get('result') or []):
            sym  = item['symbol']
            resp = (item.get('response') or [{}])[0]
            meta = resp.get('meta', {})
            current = meta.get('regularMarketPrice')
            if not current:
                continue
            current = float(current)

            timestamps  = resp.get('timestamp') or []
            closes_raw  = (resp.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
            ts_closes   = [(ts, c) for ts, c in zip(timestamps, closes_raw) if c is not None]
            closes      = [c for _, c in ts_closes]
            if len(closes) < 2:
                continue

            # All comparisons within the same series so adjustments cancel out
            latest = closes[-1]

            def pct(old):
                return round((latest - old) / old * 100, 2) if old and old > 0 else None

            day5_price  = closes[-6]   if len(closes) >= 6   else None
            month_price = closes[-22]  if len(closes) >= 22  else closes[0]
            sixmo_price = closes[-127] if len(closes) >= 127 else closes[0]

            raw_52w  = meta.get('fiftyTwoWeekChange') or meta.get('52WeekChange')
            year_pct = round(float(raw_52w) * 100, 2) if raw_52w is not None else pct(closes[0])

            result[sym] = {
                'week_pct':  pct(day5_price),
                'month_pct': pct(month_price),
                'sixmo_pct': pct(sixmo_price),
                'year_pct':  year_pct,
            }
        return result
    except Exception:
        return {}


_hist_cache    = {}
_hist_cache_ts = 0.0
_HIST_TTL      = 300  # seconds

@app.get('/market/history')
def market_history():
    global _hist_cache, _hist_cache_ts
    now = _time.time()
    if _hist_cache and (now - _hist_cache_ts) < _HIST_TTL:
        return jsonify(_hist_cache)

    raw     = request.args.get('symbols', '')
    symbols = [s.strip().upper() for s in raw.split(',') if s.strip()][:600]
    if not symbols:
        return jsonify({})
    CHUNK  = 20
    chunks = [symbols[i:i+CHUNK] for i in range(0, len(symbols), CHUNK)]
    with ThreadPoolExecutor(max_workers=len(chunks)) as ex:
        parts = list(ex.map(_history_batch, chunks))
    merged = {}
    for p in parts:
        merged.update(p)
    _hist_cache    = merged
    _hist_cache_ts = now
    return jsonify(merged)


@app.get('/market/prices')
def market_prices():
    raw     = request.args.get('symbols', '')
    symbols = [s.strip().upper() for s in raw.split(',') if s.strip()][:600]
    if not symbols:
        return jsonify({})
    CHUNK   = 20
    chunks  = [symbols[i:i+CHUNK] for i in range(0, len(symbols), CHUNK)]
    with ThreadPoolExecutor(max_workers=len(chunks)) as ex:
        parts = list(ex.map(_spark_batch, chunks))
    merged = {}
    for p in parts:
        merged.update(p)
    return jsonify(merged)


# ── Contributions ─────────────────────────────────────────────────────────────

@app.get('/contributions')
def get_contributions():
    acct = account_filter()
    conn = get_db()
    rows = (conn.execute('SELECT * FROM contributions WHERE account = ? ORDER BY date ASC, id ASC', (acct,))
            if acct else
            conn.execute('SELECT * FROM contributions ORDER BY date ASC, id ASC')).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/contributions')
def add_contribution():
    data = request.get_json(silent=True) or {}
    if not data.get('date') or data.get('amount') is None:
        return jsonify({'error': 'date and amount are required'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO contributions (date, amount, note, account) VALUES (?,?,?,?)',
        (data['date'], parse_money(data['amount']), data.get('note', ''), body_account(data))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM contributions WHERE id=?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.delete('/contributions/<int:cid>')
def delete_contribution(cid):
    conn = get_db()
    cur = conn.execute('DELETE FROM contributions WHERE id=?', (cid,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'error': 'Not found'}), 404
    return '', 204


# ── Income log ───────────────────────────────────────────────────────────────

@app.get('/income')
def get_income():
    acct = account_filter()
    conn = get_db()
    rows = (conn.execute('SELECT * FROM income_log WHERE account = ? ORDER BY date ASC, id ASC', (acct,))
            if acct else
            conn.execute('SELECT * FROM income_log ORDER BY date ASC, id ASC')).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/income')
def add_income():
    data = request.get_json(silent=True) or {}
    if not data.get('date') or data.get('amount') is None:
        return jsonify({'error': 'date and amount are required'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO income_log (date, amount, note, account) VALUES (?,?,?,?)',
        (data['date'], parse_money(data['amount']), data.get('note', ''), body_account(data))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM income_log WHERE id=?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.put('/income/<int:income_id>')
def update_income(income_id):
    data = request.get_json(silent=True) or {}
    if not data.get('date') or data.get('amount') is None:
        return jsonify({'error': 'date and amount are required'}), 400
    conn = get_db()
    cur = conn.execute(
        'UPDATE income_log SET date=?, amount=?, note=? WHERE id=?',
        (data['date'], parse_money(data['amount']), data.get('note', ''), income_id)
    )
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    row = conn.execute('SELECT * FROM income_log WHERE id=?', (income_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.delete('/income/<int:income_id>')
def delete_income(income_id):
    conn = get_db()
    cur = conn.execute('DELETE FROM income_log WHERE id=?', (income_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'error': 'Not found'}), 404
    return '', 204


# ── Raw daily spark data (used for S&P overlay) ───────────────────────────────
# Daily closes are cached in the market_cache table: requests are served from
# SQLite instantly, and a background thread tops up the tail from Yahoo at most
# once per _MARKET_TTL. Only a cold cache (new symbol / earlier start) blocks.

_MARKET_TTL        = 900   # seconds before a background refresh is triggered
_market_refreshed  = {}    # symbol -> _time.monotonic() of last Yahoo refresh
_market_refreshing = set()
_market_lock       = threading.Lock()


def _yahoo_closes(sym, period1, period2):
    """Returns (closes, splits): {date: (close, adj_close)} and {date: ratio}.

    Both close series are split-adjusted by Yahoo, so the splits come back too —
    holdings recorded in as-traded shares need them undone before valuation.
    """
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}'
           f'?period1={period1}&period2={period2}&interval=1d&events=split')
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
        data = _json.loads(r.read())
    result     = (data.get('chart', {}).get('result') or [{}])[0]
    timestamps = result.get('timestamp') or []
    indicators = result.get('indicators', {})
    closes_raw = (indicators.get('quote') or [{}])[0].get('close') or []
    # adjclose is the dividend-adjusted series; absent on some symbols/ranges.
    adj_raw    = (indicators.get('adjclose') or [{}])[0].get('adjclose') or []
    out = {}
    for i, (ts, c) in enumerate(zip(timestamps, closes_raw)):
        if c is None:
            continue
        a = adj_raw[i] if i < len(adj_raw) and adj_raw[i] is not None else None
        out[_dt.fromtimestamp(ts, tz=_tz.utc).strftime('%Y-%m-%d')] = (
            round(float(c), 2), round(float(a), 4) if a is not None else None)

    splits = {}
    for ev in ((result.get('events') or {}).get('splits') or {}).values():
        try:
            num, den = float(ev['numerator']), float(ev['denominator'])
            if den:
                day = _dt.fromtimestamp(ev['date'], tz=_tz.utc).strftime('%Y-%m-%d')
                splits[day] = num / den
        except (KeyError, TypeError, ValueError):
            continue
    return out, splits


def _store_closes(sym, closes):
    """closes maps date -> (close, adj_close). adj_close may be None."""
    if not closes:
        return
    conn = get_db()
    conn.executemany(
        'INSERT OR REPLACE INTO market_cache (symbol, date, close, adj_close) VALUES (?, ?, ?, ?)',
        [(sym, d, v[0], v[1]) for d, v in closes.items()])
    conn.commit()
    conn.close()


def _store_splits(sym, splits):
    if not splits:
        return
    conn = get_db()
    conn.executemany(
        'INSERT OR REPLACE INTO market_splits (symbol, date, ratio) VALUES (?, ?, ?)',
        [(sym, d, r) for d, r in splits.items()])
    conn.commit()
    conn.close()


def _load_splits(symbols):
    conn = get_db()
    out = {s: {} for s in symbols}
    for sym in symbols:
        for r in conn.execute('SELECT date, ratio FROM market_splits WHERE symbol = ?', (sym,)):
            out[sym][r['date']] = r['ratio']
    conn.close()
    return out


def _splits_unchecked(symbols):
    """Symbols never scanned for splits.

    An empty market_splits result is ambiguous — no splits, or never looked — so
    a kv marker records that the lookup happened. Symbols cached before splits
    were tracked get backfilled on first use rather than needing a migration.
    """
    conn = get_db()
    rows = conn.execute(
        "SELECT key FROM kv WHERE key LIKE 'splits_checked:%'").fetchall()
    conn.close()
    seen = {r['key'].split(':', 1)[1] for r in rows}
    return [s for s in symbols if s not in seen]


def _mark_splits_checked(symbols):
    if not symbols:
        return
    conn = get_db()
    conn.executemany("INSERT OR REPLACE INTO kv (key, value) VALUES (?, '1')",
                     [(f'splits_checked:{s}',) for s in symbols])
    conn.commit()
    conn.close()


def _backfill_splits(symbols, start):
    """Fetch split events for symbols whose price cache predates split tracking."""
    todo = _splits_unchecked(symbols)
    if not todo:
        return
    period1 = int(_dt.strptime(start, '%Y-%m-%d').replace(tzinfo=_tz.utc).timestamp())
    period2 = int(_dt.now(_tz.utc).timestamp())

    def pull(sym):
        try:
            _, splits = _yahoo_closes(sym, period1, period2)
            _store_splits(sym, splits)
            return sym
        except Exception:
            return None      # leave unmarked so it retries next time

    with ThreadPoolExecutor(max_workers=8) as pool:
        _mark_splits_checked([s for s in pool.map(pull, todo) if s])


def _refresh_market_cache(sym, from_date):
    try:
        period1 = int(_dt.strptime(from_date, '%Y-%m-%d').replace(tzinfo=_tz.utc).timestamp())
        period2 = int(_dt.now(_tz.utc).timestamp())
        closes, splits = _yahoo_closes(sym, period1, period2)
        _store_closes(sym, closes)
        _store_splits(sym, splits)
        with _market_lock:
            _market_refreshed[sym] = _time.monotonic()
    except Exception:
        pass
    finally:
        with _market_lock:
            _market_refreshing.discard(sym)


@app.get('/market/sparkdata')
def market_sparkdata():
    sym    = request.args.get('symbol', 'SPY').upper()
    start  = request.args.get('start')   # optional YYYY-MM-DD
    range_ = request.args.get('range', '2y')
    # adjusted=1 serves the dividend-adjusted series (total return) instead of
    # raw closes. Benchmarks want this; holdings valuation wants raw closes.
    adjusted = request.args.get('adjusted') in ('1', 'true', 'yes')
    try:
        if start:
            conn = get_db()
            rows = conn.execute(
                'SELECT date, close, adj_close FROM market_cache WHERE symbol = ? AND date >= ? ORDER BY date',
                (sym, start)).fetchall()
            conn.close()
            cached = {r['date']: (r['adj_close'] if adjusted else r['close']) for r in rows}
            # usable if the first cached close is within a week of the requested
            # start (the first trading day can trail a weekend/holiday start)
            first  = min(cached) if cached else None
            covers = first is not None and (
                _dt.strptime(first, '%Y-%m-%d') - _dt.strptime(start, '%Y-%m-%d')).days <= 7
            # rows cached before adj_close existed hold NULL there; force a re-fetch
            if adjusted and any(v is None for v in cached.values()):
                covers = False
            if covers:
                with _market_lock:
                    stale = _time.monotonic() - _market_refreshed.get(sym, float('-inf')) > _MARKET_TTL
                    spawn = stale and sym not in _market_refreshing
                    if spawn:
                        _market_refreshing.add(sym)
                if spawn:
                    # re-fetch from the last cached day so an intraday close gets finalized
                    threading.Thread(target=_refresh_market_cache,
                                     args=(sym, max(cached)), daemon=True).start()
                return jsonify(cached)
            # cold cache: fetch the full window synchronously, then serve from SQLite next time
            period1 = int(_dt.strptime(start, '%Y-%m-%d').replace(tzinfo=_tz.utc).timestamp())
            period2 = int(_dt.now(_tz.utc).timestamp())
            fetched, splits = _yahoo_closes(sym, period1, period2)
            _store_closes(sym, fetched)
            _store_splits(sym, splits)
            with _market_lock:
                _market_refreshed[sym] = _time.monotonic()
            # fall back to the raw close when Yahoo omits an adjusted value
            return jsonify({d: ((v[1] if v[1] is not None else v[0]) if adjusted else v[0])
                            for d, v in fetched.items()})
        else:
            url = (f'https://query1.finance.yahoo.com/v7/finance/spark?symbols={sym}'
                   f'&range={range_}&interval=1d')
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
                data = _json.loads(r.read())
            items = data['spark'].get('result') or []
            if not items:
                return jsonify({})
            resp       = (items[0].get('response') or [{}])[0]
            timestamps = resp.get('timestamp') or []
            closes_raw = (resp.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
        out = {}
        for ts, c in zip(timestamps, closes_raw):
            if c is not None:
                out[_dt.fromtimestamp(ts, tz=_tz.utc).strftime('%Y-%m-%d')] = round(float(c), 2)
        return jsonify(out)
    except Exception:
        return jsonify({}), 502


def closes_for(symbols, start, adjusted=False, as_traded=False):
    """{symbol: {date: close}} from `start`, served from cache and backfilled.

    A symbol is re-fetched when the cache starts more than a week after `start`,
    or when adjusted closes are wanted and the cached rows predate that column.

    `as_traded` undoes Yahoo's retroactive split adjustment, putting prices back
    in the share terms the trades were recorded in. Use it for valuing holdings;
    leave it off for benchmarks, where the series only needs internal consistency.
    """
    conn = get_db()
    cached = {}
    for sym in symbols:
        rows = conn.execute(
            'SELECT date, close, adj_close FROM market_cache WHERE symbol = ? AND date >= ? ORDER BY date',
            (sym, start)).fetchall()
        cached[sym] = {r['date']: (r['adj_close'] if adjusted else r['close']) for r in rows}
    conn.close()

    def covered(sym):
        days = cached[sym]
        if not days or any(v is None for v in days.values()):
            return False
        gap = (_dt.strptime(min(days), '%Y-%m-%d') - _dt.strptime(start, '%Y-%m-%d')).days
        return gap <= 7

    stale = [s for s in symbols if not covered(s)]
    if stale:
        period1 = int(_dt.strptime(start, '%Y-%m-%d').replace(tzinfo=_tz.utc).timestamp())
        period2 = int(_dt.now(_tz.utc).timestamp())

        def pull(sym):
            try:
                fetched, splits = _yahoo_closes(sym, period1, period2)
                _store_closes(sym, fetched)
                _store_splits(sym, splits)
                return sym, {d: ((v[1] if v[1] is not None else v[0]) if adjusted else v[0])
                             for d, v in fetched.items()}
            except Exception:
                # keep whatever was cached; a missing symbol degrades one holding,
                # it should not fail the whole series
                return sym, {d: v for d, v in cached.get(sym, {}).items() if v is not None}

        with ThreadPoolExecutor(max_workers=8) as pool:
            for sym, days in pool.map(pull, stale):
                cached[sym] = days

    if as_traded:
        _backfill_splits(symbols, start)
        splits = _load_splits(symbols)
        cached = {sym: analytics.unadjust_splits(hist, splits.get(sym) or {})
                  for sym, hist in cached.items()}

    return cached


@app.get('/market/dailycloses')
def market_dailycloses():
    """Daily raw closes for several symbols at once, for marking holdings to market."""
    symbols = [s.strip().upper() for s in (request.args.get('symbols') or '').split(',') if s.strip()]
    start   = request.args.get('start')
    if not symbols or not start:
        return jsonify({})
    return jsonify(closes_for(symbols, start, as_traded=True))


BENCHMARKS = ('SPY', 'VOO', 'QQQ')


@app.get('/analytics/timeseries')
def analytics_timeseries():
    """Daily portfolio value, benchmark equivalents, and risk statistics.

    Query: account (ira|brokerage|all), clamped=0|1, rf=<annual risk-free rate>.
    """
    acct    = account_filter()
    clamped = request.args.get('clamped') in ('1', 'true', 'yes')
    try:
        risk_free = float(request.args.get('rf', 0) or 0)
    except ValueError:
        risk_free = 0.0

    conn = get_db()
    def rows(table, date_col):
        sql = f'SELECT * FROM {table}' + (' WHERE account = ?' if acct else '')
        return [dict(r) for r in (conn.execute(sql, (acct,)) if acct else conn.execute(sql))]

    trades        = rows('trades', 'close_date')
    positions     = rows('open_positions', 'open_date')
    contributions = rows('contributions', 'date')
    income        = rows('income_log', 'date')
    conn.close()

    if not contributions and not trades and not positions:
        return jsonify({'series': [], 'benchmarks': {}, 'stats': {}, 'start': None})

    invest_dates = [x['open_date'] for x in trades + positions]
    first_invest = min(invest_dates) if invest_dates else None
    candidates   = [c['date'] for c in contributions] + invest_dates
    start        = min(candidates)

    symbols = sorted({x['symbol'] for x in trades + positions})
    holdings_px  = closes_for(symbols, start, as_traded=True) if symbols else {}
    benchmark_px = closes_for(BENCHMARKS, start, adjusted=True)

    # SPY's dates are the market calendar; fall back to whatever prices we have.
    days = sorted(benchmark_px.get('SPY') or
                  {d for hist in holdings_px.values() for d in hist})
    days = [d for d in days if d >= start]
    if not days:
        return jsonify({'series': [], 'benchmarks': {}, 'stats': {}, 'start': start})

    series = analytics.build_daily_series(
        days, positions, trades, contributions, income, holdings_px)

    benchmarks = {}
    for sym in BENCHMARKS:
        hist = benchmark_px.get(sym) or {}
        if hist:
            benchmarks[sym] = analytics.simulate_fund(
                days, contributions, hist, first_invest, clamped)

    spy_series  = benchmarks.get('SPY') or []
    spy_returns = analytics.daily_returns(spy_series) if spy_series else None

    stats = analytics.performance_stats(series, spy_returns, risk_free)
    bench_stats = {sym: analytics.performance_stats(rs, spy_returns, risk_free)
                   for sym, rs in benchmarks.items() if rs}

    return jsonify({
        'start': start,
        'first_invest_date': first_invest,
        'clamped': clamped,
        'series': series,
        'benchmarks': benchmarks,
        'stats': stats,
        'benchmark_stats': bench_stats,
    })


# ── Plaid ─────────────────────────────────────────────────────────────────────

@app.post('/plaid/link-token')
def plaid_link_token():
    global _plaid_access_token
    try:
        req = LinkTokenCreateRequest(
            user=LinkTokenCreateRequestUser(client_user_id='local-user'),
            client_name='Project Cirrus',
            products=[Products('investments')],
            country_codes=[CountryCode('US')],
            language='en',
        )
        resp = _plaid.link_token_create(req)
        return jsonify({'link_token': resp.to_dict()['link_token']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.post('/plaid/exchange')
def plaid_exchange():
    global _plaid_access_token
    public_token = (request.get_json(silent=True) or {}).get('public_token')
    if not public_token:
        return jsonify({'error': 'missing public_token'}), 400
    try:
        resp = _plaid.item_public_token_exchange(
            ItemPublicTokenExchangeRequest(public_token=public_token)
        )
        _plaid_access_token = resp.to_dict()['access_token']
        _save_plaid_token(_plaid_access_token)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.get('/plaid/balance')
def plaid_balance():
    if not _plaid_access_token:
        return jsonify({'error': 'not connected'}), 400
    try:
        resp = _plaid.accounts_balance_get(
            AccountsBalanceGetRequest(access_token=_plaid_access_token)
        ).to_dict()
        accounts = [
            {
                'name':     a['name'],
                'type':     str(a['type']),
                'subtype':  str(a['subtype']),
                'balance':  a['balances']['current'],
                'currency': a['balances'].get('iso_currency_code', 'USD'),
            }
            for a in resp['accounts']
        ]
        return jsonify(accounts)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.get('/plaid/holdings')
def plaid_holdings():
    if not _plaid_access_token:
        return jsonify({'error': 'not connected'}), 400
    try:
        resp = _plaid.investments_holdings_get(
            InvestmentsHoldingsGetRequest(access_token=_plaid_access_token)
        ).to_dict()
        secs = {s['security_id']: s for s in resp['securities']}
        holdings = [
            {
                'name':     secs.get(h['security_id'], {}).get('name', ''),
                'ticker':   secs.get(h['security_id'], {}).get('ticker_symbol', ''),
                'quantity': h['quantity'],
                'value':    h['institution_value'] or (
                    h['quantity'] * (secs.get(h['security_id'], {}).get('close_price') or 0)
                ),
                'cost':     h.get('cost_basis'),
                'currency': h.get('iso_currency_code', 'USD'),
            }
            for h in resp['holdings']
        ]
        return jsonify(holdings)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.get('/plaid/status')
def plaid_status():
    return jsonify({'connected': _plaid_access_token is not None})


@app.get('/plaid/debug')
def plaid_debug():
    if not _plaid_access_token:
        return jsonify({'error': 'not connected'}), 400
    try:
        resp = _plaid.investments_holdings_get(
            InvestmentsHoldingsGetRequest(access_token=_plaid_access_token)
        ).to_dict()
        return jsonify(resp)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Plaid: investment transactions ───────────────────────────────────────────

@app.get('/plaid/investment-transactions')
def plaid_investment_transactions():
    if not _plaid_access_token:
        return jsonify({'error': 'not connected'}), 400
    try:
        start = _date(2020, 1, 1)
        end   = _date.today()
        resp  = _plaid.investments_transactions_get(
            InvestmentsTransactionsGetRequest(
                access_token=_plaid_access_token,
                start_date=start,
                end_date=end,
            )
        ).to_dict()

        secs = {s['security_id']: s for s in (resp.get('securities') or [])}

        txns = []
        for t in (resp.get('investment_transactions') or []):
            if t.get('type') not in ('buy', 'sell'):
                continue
            sec    = secs.get(t.get('security_id'), {})
            ticker = (sec.get('ticker_symbol') or '').upper()
            if not ticker:
                continue
            date_val = t.get('date')
            txns.append({
                'id':       t.get('investment_transaction_id'),
                'date':     str(date_val) if date_val else '',
                'ticker':   ticker,
                'type':     t.get('type'),
                'quantity': abs(float(t.get('quantity') or 0)),
                'amount':   abs(float(t.get('amount')   or 0)),
                'price':    t.get('price'),
                'fees':     float(t.get('fees') or 0),
                'name':     sec.get('name', ''),
            })

        txns.sort(key=lambda x: x['date'], reverse=True)
        return jsonify(txns)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Claude: explain stock movement ───────────────────────────────────────────

def _fetch_news(symbol):
    try:
        url = (
            'https://query1.finance.yahoo.com/v1/finance/search'
            f'?q={urllib.parse.quote(symbol)}&quotesCount=0&newsCount=8&listsCount=0'
        )
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=6, context=_SSL) as r:
            data = _json.loads(r.read())
        headlines = [
            item.get('title', '')
            for item in data.get('news', [])
            if item.get('title')
        ]
        return headlines[:8]
    except Exception:
        return []


@app.post('/api/explain')
def explain_stock():
    data       = request.get_json(silent=True) or {}
    symbol     = data.get('symbol', '').upper()
    name       = data.get('name', symbol)
    price      = data.get('price')
    change_pct = data.get('change_pct')
    week_pct   = data.get('week_pct')
    month_pct  = data.get('month_pct')
    sixmo_pct  = data.get('sixmo_pct')
    year_pct   = data.get('year_pct')

    today    = _dt.now(_tz.utc).strftime('%B %d, %Y')
    headlines = _fetch_news(symbol)
    news_block = (
        'Recent headlines:\n' + '\n'.join(f'- {h}' for h in headlines)
        if headlines else 'No recent headlines available.'
    )

    def fmt(v): return f'{v:+.2f}%' if v is not None else 'N/A'

    prompt = (
        f'Today is {today}.\n\n'
        f'{name} ({symbol}) — current price ${price}\n'
        f'Performance: today {fmt(change_pct)} · 5-day {fmt(week_pct)} · '
        f'1-month {fmt(month_pct)} · 6-month {fmt(sixmo_pct)} · 1-year {fmt(year_pct)}\n\n'
        f'{news_block}\n\n'
        f'Based on the price action and headlines above, give a concise explanation of:\n'
        f'1. What is driving the stock\'s recent movement\n'
        f'2. Key fundamental or macro factors investors are watching\n'
        f'3. Context from the headlines above\n\n'
        f'Be specific. Keep it under 200 words. No disclaimers.'
    )

    def generate():
        try:
            with _claude.messages.stream(
                model='claude-sonnet-4-6',
                max_tokens=400,
                messages=[{'role': 'user', 'content': prompt}],
            ) as stream:
                for text in stream.text_stream:
                    yield f'data: {_json.dumps({"text": text})}\n\n'
        except Exception as e:
            yield f'data: {_json.dumps({"text": f"Error: {e}"})}\n\n'
        yield 'data: [DONE]\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


# ── Symbol search (Yahoo Finance) ────────────────────────────────────────────

@app.get('/search')
def search_symbols():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    try:
        url = (
            'https://query1.finance.yahoo.com/v1/finance/search'
            f'?q={urllib.parse.quote(q)}&quotesCount=7&newsCount=0&listsCount=0'
        )
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=5, context=ctx) as r:
            data = _json.loads(r.read())
        results = [
            {
                'symbol': item['symbol'],
                'name': item.get('shortname') or item.get('longname', ''),
            }
            for item in data.get('quotes', [])
            if item.get('quoteType') in ('EQUITY', 'ETF')
        ]
        return jsonify(results[:6])
    except Exception:
        return jsonify([])


# ── Live quote proxy (Yahoo Finance) ─────────────────────────────────────────

@app.get('/quote/<symbol>')
def get_quote(symbol):
    data = _chart_price(symbol.upper())
    if data:
        return jsonify({'symbol': symbol.upper(), 'price': data['price']})
    return jsonify({'error': f'Could not fetch price for {symbol}'}), 502


if __name__ == '__main__':
    ensure_tables()
    _init_plaid_token()
    app.run(debug=True, port=8080)
