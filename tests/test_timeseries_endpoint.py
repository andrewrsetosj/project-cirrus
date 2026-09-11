"""End-to-end test of /analytics/timeseries with the market stubbed out.

closes_for is the only seam that touches the network, so patching it keeps these
tests deterministic and offline.
"""
import pytest


DAYS = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']


@pytest.fixture
def stub_market(app_module, monkeypatch):
    """Give every benchmark a flat 100 and the holding a doubling price."""
    def fake_closes(symbols, start, adjusted=False, as_traded=False):
        out = {}
        for sym in symbols:
            # read from BENCHMARKS so swapping a benchmark can't silently
            # leave one of these series empty
            if sym in app_module.BENCHMARKS:
                out[sym] = {d: 100.0 for d in DAYS}
            elif sym == 'X':
                out[sym] = dict(zip(DAYS, [10.0, 10.0, 15.0, 20.0]))
            else:
                out[sym] = {}
        return out
    monkeypatch.setattr(app_module, 'closes_for', fake_closes)
    return fake_closes


@pytest.fixture
def seeded(client, stub_market):
    client.post('/contributions', json={'date': '2026-01-02', 'amount': '1000', 'account': 'ira'})
    client.post('/positions', json={'symbol': 'X', 'open_date': '2026-01-02',
                                    'shares': '100', 'total_buy': '1000', 'account': 'ira'})
    return client


def test_series_tracks_the_holding(seeded):
    body = seeded.get('/analytics/timeseries?account=ira').get_json()
    assert [r['date'] for r in body['series']] == DAYS
    # 100 shares: 1000 -> 1000 -> 1500 -> 2000
    assert [r['value'] for r in body['series']] == [1000.0, 1000.0, 1500.0, 2000.0]


def test_benchmarks_are_flat_when_the_index_is_flat(seeded):
    body = seeded.get('/analytics/timeseries?account=ira').get_json()
    spy = body['benchmarks']['SPY']
    assert [r['value'] for r in spy] == [1000.0, 1000.0, 1000.0, 1000.0]
    assert body['benchmark_stats']['SPY']['twr'] == pytest.approx(0.0)


def test_stats_report_the_doubling(seeded):
    stats = seeded.get('/analytics/timeseries?account=ira').get_json()['stats']
    assert stats['twr'] == pytest.approx(1.0)          # 1000 -> 2000, no new money
    assert stats['max_drawdown'] == pytest.approx(0.0)  # never fell
    assert stats['best_day'] == pytest.approx(0.5)      # 1000 -> 1500


def test_deposits_do_not_inflate_reported_return(client, stub_market):
    """Two deposits, price never moves: the honest answer is 0% return."""
    client.post('/contributions', json={'date': '2026-01-02', 'amount': '1000', 'account': 'ira'})
    client.post('/contributions', json={'date': '2026-01-06', 'amount': '5000', 'account': 'ira'})
    client.post('/positions', json={'symbol': 'FLAT', 'open_date': '2026-01-02',
                                    'shares': '1', 'total_buy': '1000', 'account': 'ira'})
    body = client.get('/analytics/timeseries?account=ira').get_json()
    assert body['series'][-1]['value'] == 6000.0
    assert body['stats']['twr'] == pytest.approx(0.0)


def test_clamped_flag_changes_the_benchmark(client, stub_market, monkeypatch, app_module):
    def rising(symbols, start, adjusted=False, as_traded=False):
        return {s: dict(zip(DAYS, [10.0, 20.0, 20.0, 20.0])) for s in symbols}
    monkeypatch.setattr(app_module, 'closes_for', rising)

    client.post('/contributions', json={'date': '2026-01-02', 'amount': '100', 'account': 'ira'})
    client.post('/positions', json={'symbol': 'X', 'open_date': '2026-01-05',
                                    'shares': '5', 'total_buy': '100', 'account': 'ira'})

    loose = client.get('/analytics/timeseries?account=ira&clamped=0').get_json()
    tight = client.get('/analytics/timeseries?account=ira&clamped=1').get_json()

    assert loose['benchmarks']['SPY'][-1]['value'] == pytest.approx(200.0)  # 10 sh @ 20
    assert tight['benchmarks']['SPY'][-1]['value'] == pytest.approx(100.0)  # 5 sh @ 20
    assert tight['first_invest_date'] == '2026-01-05'


def test_beta_against_a_flat_benchmark_is_undefined(seeded):
    assert seeded.get('/analytics/timeseries?account=ira').get_json()['stats']['beta'] is None


def test_empty_account_returns_empty_not_an_error(client, stub_market):
    body = client.get('/analytics/timeseries?account=brokerage').get_json()
    assert body['series'] == [] and body['stats'] == {}


def test_risk_free_rate_is_applied(seeded):
    zero = seeded.get('/analytics/timeseries?account=ira&rf=0').get_json()['stats']
    high = seeded.get('/analytics/timeseries?account=ira&rf=0.05').get_json()['stats']
    assert high['sharpe'] < zero['sharpe']


def test_unpriced_holding_does_not_break_the_series(client, stub_market):
    client.post('/contributions', json={'date': '2026-01-02', 'amount': '500', 'account': 'ira'})
    client.post('/positions', json={'symbol': 'NOPRICE', 'open_date': '2026-01-02',
                                    'shares': '5', 'total_buy': '500', 'account': 'ira'})
    body = client.get('/analytics/timeseries?account=ira').get_json()
    assert [r['value'] for r in body['series']] == [500.0] * 4
