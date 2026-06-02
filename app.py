from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
import urllib.request
import urllib.parse
import json as _json
import ssl
import time as _time
from concurrent.futures import ThreadPoolExecutor


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
    app.run(debug=True, port=8080)
