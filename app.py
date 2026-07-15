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
        CREATE TABLE IF NOT EXISTS open_positions (
            id        INTEGER PRIMARY KEY,
            symbol    TEXT NOT NULL,
            open_date TEXT NOT NULL,
            shares    INTEGER NOT NULL,
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
    conn.commit()
    conn.close()


# ── Static / index ────────────────────────────────────────────────────────────

@app.get('/')
def index():
    return send_from_directory('static', 'index.html')


# ── Closed trades ─────────────────────────────────────────────────────────────

@app.get('/trades')
def get_trades():
    conn = get_db()
    rows = conn.execute('SELECT * FROM trades ORDER BY id ASC').fetchall()
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
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell) VALUES (?,?,?,?,?,?)',
        (data['symbol'].upper(), data['open_date'], data['close_date'],
         int(data['shares']), float(data['total_buy']), float(data['total_sell']))
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
         int(data['shares']), float(data['total_buy']), float(data['total_sell']), trade_id)
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
    conn = get_db()
    rows = conn.execute('SELECT * FROM open_positions ORDER BY open_date ASC').fetchall()
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
        'INSERT INTO open_positions (symbol, open_date, shares, total_buy) VALUES (?,?,?,?)',
        (data['symbol'].upper(), data['open_date'], int(data['shares']), float(data['total_buy']))
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
         int(data['shares']), float(data['total_buy']), pos_id)
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
    cur = conn.execute(
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell) VALUES (?,?,?,?,?,?)',
        (pos['symbol'], pos['open_date'], data['close_date'],
         pos['shares'], pos['total_buy'], float(data['total_sell']))
    )
    trade_id = cur.lastrowid
    conn.execute('DELETE FROM open_positions WHERE id = ?', (pos_id,))
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
    conn = get_db()
    rows = conn.execute('SELECT * FROM contributions ORDER BY date ASC, id ASC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/contributions')
def add_contribution():
    data = request.get_json(silent=True) or {}
    if not data.get('date') or data.get('amount') is None:
        return jsonify({'error': 'date and amount are required'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO contributions (date, amount, note) VALUES (?,?,?)',
        (data['date'], float(data['amount']), data.get('note', ''))
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
    conn = get_db()
    rows = conn.execute('SELECT * FROM income_log ORDER BY date ASC, id ASC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.post('/income')
def add_income():
    data = request.get_json(silent=True) or {}
    if not data.get('date') or data.get('amount') is None:
        return jsonify({'error': 'date and amount are required'}), 400
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO income_log (date, amount, note) VALUES (?,?,?)',
        (data['date'], float(data['amount']), data.get('note', ''))
    )
    conn.commit()
    row = conn.execute('SELECT * FROM income_log WHERE id=?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


# ── Raw daily spark data (used for S&P overlay) ───────────────────────────────
# Daily closes are cached in the market_cache table: requests are served from
# SQLite instantly, and a background thread tops up the tail from Yahoo at most
# once per _MARKET_TTL. Only a cold cache (new symbol / earlier start) blocks.

_MARKET_TTL        = 900   # seconds before a background refresh is triggered
_market_refreshed  = {}    # symbol -> _time.monotonic() of last Yahoo refresh
_market_refreshing = set()
_market_lock       = threading.Lock()


def _yahoo_closes(sym, period1, period2):
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}'
           f'?period1={period1}&period2={period2}&interval=1d')
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=15, context=_SSL) as r:
        data = _json.loads(r.read())
    result     = (data.get('chart', {}).get('result') or [{}])[0]
    timestamps = result.get('timestamp') or []
    closes_raw = (result.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
    out = {}
    for ts, c in zip(timestamps, closes_raw):
        if c is not None:
            out[_dt.fromtimestamp(ts, tz=_tz.utc).strftime('%Y-%m-%d')] = round(float(c), 2)
    return out


def _store_closes(sym, closes):
    if not closes:
        return
    conn = get_db()
    conn.executemany(
        'INSERT OR REPLACE INTO market_cache (symbol, date, close) VALUES (?, ?, ?)',
        [(sym, d, c) for d, c in closes.items()])
    conn.commit()
    conn.close()


def _refresh_market_cache(sym, from_date):
    try:
        period1 = int(_dt.strptime(from_date, '%Y-%m-%d').replace(tzinfo=_tz.utc).timestamp())
        period2 = int(_dt.now(_tz.utc).timestamp())
        _store_closes(sym, _yahoo_closes(sym, period1, period2))
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
    try:
        if start:
            conn = get_db()
            rows = conn.execute(
                'SELECT date, close FROM market_cache WHERE symbol = ? AND date >= ? ORDER BY date',
                (sym, start)).fetchall()
            conn.close()
            cached = {r['date']: r['close'] for r in rows}
            # usable if the first cached close is within a week of the requested
            # start (the first trading day can trail a weekend/holiday start)
            first  = min(cached) if cached else None
            covers = first is not None and (
                _dt.strptime(first, '%Y-%m-%d') - _dt.strptime(start, '%Y-%m-%d')).days <= 7
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
            out = _yahoo_closes(sym, period1, period2)
            _store_closes(sym, out)
            with _market_lock:
                _market_refreshed[sym] = _time.monotonic()
            return jsonify(out)
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
