"""closes_for keeps the cached price history current, not just long enough.

Yahoo is stubbed out; each test records which (symbol, from-date) pairs were
fetched so the refresh decisions can be asserted directly.
"""
from datetime import datetime, timezone

import pytest


def _day(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')


@pytest.fixture
def yahoo(app_module, monkeypatch):
    """Serve `prices[sym]` (date -> close) and log every request."""
    calls, prices = [], {}

    def fake(sym, period1, period2):
        calls.append((sym, _day(period1)))
        out = {d: (c, c) for d, c in prices.get(sym, {}).items() if d >= _day(period1)}
        return out, {}

    monkeypatch.setattr(app_module, '_yahoo_closes', fake)
    return calls, prices


def _seed(db, sym, closes):
    conn = db()
    conn.executemany('INSERT INTO market_cache (symbol, date, close, adj_close) VALUES (?, ?, ?, ?)',
                     [(sym, d, c, c) for d, c in closes.items()])
    conn.commit()
    conn.close()


def test_stale_tail_is_fetched_before_serving(app_module, db, yahoo):
    calls, prices = yahoo
    _seed(db, 'WFC', {'2026-09-04': 89.0, '2026-09-08': 90.0})
    prices['WFC'] = {'2026-09-08': 90.0, '2026-09-09': 91.0, '2026-10-26': 84.0}

    out = app_module.closes_for(['WFC'], '2026-09-04')

    assert calls == [('WFC', '2026-09-08')]           # only the missing tail
    assert out['WFC'] == {'2026-09-04': 89.0, '2026-09-08': 90.0,
                          '2026-09-09': 91.0, '2026-10-26': 84.0}
    stored = db().execute("SELECT max(date) FROM market_cache WHERE symbol = 'WFC'").fetchone()[0]
    assert stored == '2026-10-26'


def test_tail_refresh_is_throttled_by_ttl(app_module, db, yahoo):
    calls, prices = yahoo
    _seed(db, 'WFC', {'2026-09-04': 89.0})
    prices['WFC'] = {'2026-09-04': 89.0, '2026-09-05': 90.0}

    app_module.closes_for(['WFC'], '2026-09-04')
    app_module.closes_for(['WFC'], '2026-09-04')

    assert len(calls) == 1


def test_failed_tail_refresh_serves_the_cache(app_module, db, monkeypatch):
    def down(*_):
        raise OSError('offline')
    monkeypatch.setattr(app_module, '_yahoo_closes', down)
    _seed(db, 'WFC', {'2026-09-04': 89.0, '2026-09-08': 90.0})

    out = app_module.closes_for(['WFC'], '2026-09-04')

    assert out['WFC'] == {'2026-09-04': 89.0, '2026-09-08': 90.0}


def test_cold_cache_fetches_the_full_window(app_module, yahoo):
    calls, prices = yahoo
    prices['PLTR'] = {'2026-09-04': 150.0, '2026-09-08': 155.0}

    out = app_module.closes_for(['PLTR'], '2026-09-04')

    assert calls == [('PLTR', '2026-09-04')]
    assert out['PLTR'] == {'2026-09-04': 150.0, '2026-09-08': 155.0}
