"""Multi-lot sells: selling a share quantity that spans more than one open lot.

The gap these cover: a 17-share IBM sale against lots of 13.46 and 3.91 shares
had no representation at all, because the only sell path could not reach past a
single lot.
"""
import pytest


def test_sell_spans_two_lots_fifo(make_position, sell_symbol, client):
    a = make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    b = make_position(symbol='IBM', open_date='2026-08-19', shares='3.91',  total_buy='920.12')

    resp = sell_symbol(symbol='IBM', shares='17', total_sell='4136.11')
    assert resp.status_code == 201, resp.get_json()
    trades = resp.get_json()
    assert len(trades) == 2

    # FIFO: the older lot is consumed whole, the newer one partially.
    assert trades[0]['open_date'] == '2026-08-13'
    assert trades[0]['shares'] == 13.46
    assert trades[1]['open_date'] == '2026-08-19'
    assert trades[1]['shares'] == 3.54

    # Per-lot open_date survives, which is what days-held and CAGR key off.
    assert {t['open_date'] for t in trades} == {'2026-08-13', '2026-08-19'}

    remaining = client.get('/positions').get_json()
    assert len(remaining) == 1
    assert remaining[0]['id'] == b['id']
    assert remaining[0]['shares'] == 0.37
    del a


def test_proceeds_sum_back_to_the_amount_entered(make_position, sell_symbol):
    """A pro-rata split that doesn't divide evenly must not lose or invent a cent."""
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.91',  total_buy='920.12')

    trades = sell_symbol(symbol='IBM', shares='17', total_sell='4136.11').get_json()
    assert round(sum(t['total_sell'] for t in trades), 2) == 4136.11
    for t in trades:
        assert t['total_sell'] == round(t['total_sell'], 2)


def test_cost_basis_is_conserved_across_the_split(make_position, sell_symbol, client):
    """Basis realized plus basis still open must equal what was originally paid."""
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.91',  total_buy='920.12')

    trades = sell_symbol(symbol='IBM', shares='17', total_sell='4136.11').get_json()
    realized = round(sum(t['total_buy'] for t in trades), 2)
    still_open = round(sum(p['total_buy'] for p in client.get('/positions').get_json()), 2)
    assert round(realized + still_open, 2) == round(3199.31 + 920.12, 2)


def test_sell_lands_exactly_on_a_lot_boundary(make_position, sell_symbol, client):
    """13.46 shares out of 13.46 + 3.91 closes lot one and leaves lot two untouched."""
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    b = make_position(symbol='IBM', open_date='2026-08-19', shares='3.91', total_buy='920.12')

    trades = sell_symbol(symbol='IBM', shares='13.46', total_sell='3274.68').get_json()
    assert len(trades) == 1
    assert trades[0]['total_sell'] == 3274.68

    remaining = client.get('/positions').get_json()
    assert len(remaining) == 1
    assert remaining[0]['id'] == b['id']
    assert remaining[0]['shares'] == 3.91
    assert remaining[0]['total_buy'] == 920.12


def test_sell_everything_closes_every_lot(make_position, sell_symbol, client):
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.91',  total_buy='920.12')

    resp = sell_symbol(symbol='IBM', shares='17.37', total_sell='4225.94')
    assert resp.status_code == 201, resp.get_json()
    assert client.get('/positions').get_json() == []


def test_lifo_consumes_the_newest_lot_first(make_position, sell_symbol, client):
    a = make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.91', total_buy='920.12')

    trades = sell_symbol(symbol='IBM', shares='5', total_sell='1216.45', method='lifo').get_json()
    assert trades[0]['open_date'] == '2026-08-19'
    assert trades[0]['shares'] == 3.91
    assert trades[1]['open_date'] == '2026-08-13'
    assert trades[1]['shares'] == 1.09

    remaining = client.get('/positions').get_json()
    assert [p['id'] for p in remaining] == [a['id']]


def test_float_noise_total_is_still_fully_sellable(make_position, sell_symbol, client):
    """13.972 + 3.1 doesn't land exactly on 17.072 in float64; the sell must still clear."""
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.972', total_buy='4600.95')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.1', total_buy='1020.00')

    resp = sell_symbol(symbol='IBM', shares='17.072', total_sell='5800.00')
    assert resp.status_code == 201, resp.get_json()
    assert client.get('/positions').get_json() == []


def test_oversell_across_lots_is_rejected(make_position, sell_symbol, client):
    make_position(symbol='IBM', open_date='2026-08-13', shares='13.46', total_buy='3199.31')
    make_position(symbol='IBM', open_date='2026-08-19', shares='3.91',  total_buy='920.12')

    resp = sell_symbol(symbol='IBM', shares='18', total_sell='4380')
    assert resp.status_code == 400
    assert '17.37' in resp.get_json()['error']
    # nothing partially applied
    assert len(client.get('/positions').get_json()) == 2
    assert client.get('/trades').get_json() == []


def test_sell_is_scoped_to_one_account(make_position, sell_symbol, client):
    make_position(symbol='IBM', open_date='2026-08-13', shares='10', total_buy='2400', account='ira')
    make_position(symbol='IBM', open_date='2026-08-19', shares='5',  total_buy='1200', account='brokerage')

    resp = sell_symbol(symbol='IBM', shares='10', total_sell='2500', account='ira')
    assert resp.status_code == 201
    assert [t['account'] for t in resp.get_json()] == ['ira']

    remaining = client.get('/positions').get_json()
    assert len(remaining) == 1
    assert remaining[0]['account'] == 'brokerage'

    # and the brokerage lot alone can't cover a 10-share sale
    assert sell_symbol(symbol='IBM', shares='10', total_sell='2500', account='brokerage').status_code == 400


def test_unknown_symbol_is_404(sell_symbol):
    assert sell_symbol(symbol='NOPE', shares='1', total_sell='10').status_code == 404


@pytest.mark.parametrize('bad', ['0', '-1'])
def test_nonpositive_quantity_rejected(make_position, sell_symbol, bad):
    make_position(symbol='IBM', shares='10', total_buy='1000')
    assert sell_symbol(symbol='IBM', shares=bad, total_sell='100').status_code == 400


def test_bad_method_rejected(make_position, sell_symbol):
    make_position(symbol='IBM', shares='10', total_buy='1000')
    resp = sell_symbol(symbol='IBM', shares='1', total_sell='100', method='hifo')
    assert resp.status_code == 400
    assert 'method' in resp.get_json()['error']
