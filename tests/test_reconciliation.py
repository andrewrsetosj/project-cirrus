"""Conservation properties: whatever the sequence of partial sells, the pieces
must add back up to what went in.

Shares and cost basis are the two quantities that must be conserved. Basis is
allocated proportionally and snapped to cents, so it is conserved exactly (the
remainder is computed as total - allocated, never re-derived) rather than
approximately.
"""
import random

import pytest


def _slices(total, n, rng):
    """Split `total` into n positive parts that sum to exactly `total`."""
    cuts = sorted(rng.uniform(0, total) for _ in range(n - 1))
    parts, prev = [], 0.0
    for c in cuts:
        parts.append(round(c - prev, 6))
        prev = c
    parts.append(round(total - prev, 6))
    return [p for p in parts if p > 1e-6]


@pytest.mark.parametrize('seed', range(25))
def test_partial_sells_conserve_shares_and_basis(seed, make_position, sell, client):
    rng = random.Random(seed)
    shares = round(rng.uniform(1, 500) + rng.random(), 6)
    basis = round(rng.uniform(100, 50_000), 2)

    pos = make_position(shares=str(shares), total_buy=str(basis))
    pid = pos['id']

    for part in _slices(shares, rng.randint(2, 6), rng):
        open_now = client.get('/positions').get_json()
        if not open_now:
            break
        held = open_now[0]['shares']
        take = min(part, held)
        if take <= 0:
            continue
        resp = sell(pid, shares=repr(take), total_sell='100')
        assert resp.status_code == 201, (resp.get_json(), take, held)

    # sweep up anything left so every share ends as a closed trade
    left = client.get('/positions').get_json()
    if left:
        resp = sell(pid, shares=repr(left[0]['shares']), total_sell='100')
        assert resp.status_code == 201, resp.get_json()

    trades = client.get('/trades').get_json()
    assert round(sum(t['shares'] for t in trades), 6) == pytest.approx(shares, abs=1e-6)
    assert round(sum(t['total_buy'] for t in trades), 2) == pytest.approx(basis, abs=0.01)
    assert client.get('/positions').get_json() == []


def test_basis_never_drifts_across_many_small_sells(make_position, sell, client):
    """The 13.972 / 4600.95 case, shaved down in equal slices."""
    pos = make_position(shares='13.972', total_buy='4600.95')
    for _ in range(7):
        assert sell(pos['id'], shares='1.3', total_sell='100').status_code == 201

    left = client.get('/positions').get_json()[0]
    assert left['shares'] == pytest.approx(4.872, abs=1e-9)
    assert sell(pos['id'], shares=repr(left['shares']), total_sell='100').status_code == 201

    trades = client.get('/trades').get_json()
    assert sum(t['shares'] for t in trades) == pytest.approx(13.972, abs=1e-9)
    assert round(sum(t['total_buy'] for t in trades), 2) == 4600.95


def test_full_sell_deletes_position(make_position, sell, client):
    pos = make_position(shares='10', total_buy='1000')
    assert sell(pos['id'], shares='10', total_sell='1100').status_code == 201
    assert client.get('/positions').get_json() == []
    trade = client.get('/trades').get_json()[0]
    assert trade['total_buy'] == 1000.0


def test_sell_without_shares_closes_whole_position(make_position, sell, client):
    pos = make_position(shares='7.5', total_buy='900')
    assert sell(pos['id']).status_code == 201
    assert client.get('/positions').get_json() == []
    assert client.get('/trades').get_json()[0]['shares'] == 7.5
