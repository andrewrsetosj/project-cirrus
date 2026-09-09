"""Float-precision regressions.

The bug these exist for: a position of 13.972 shares, sold 13, left a remainder
of 0.9719999999999995 because 13.972 has no exact float64 representation. The
follow-on bug was that selling that remainder as "0.972" was then rejected as
more shares than the position held.
"""
import pytest


def test_parse_shares_strips_binary_noise(app_module):
    assert app_module.parse_shares('13.972') == 13.972
    assert app_module.parse_shares(0.1 + 0.2) == 0.3


def test_parse_money_snaps_to_cents(app_module):
    # the four values that were actually sitting corrupted in the live DB
    assert app_module.parse_money(3006.0642857142857) == 3006.06
    assert app_module.parse_money(6538.857142857143) == 6538.86
    assert app_module.parse_money(4280.872459204123) == 4280.87
    assert app_module.parse_money('1670.0357142857147') == 1670.04


def test_parse_money_result_is_exact_at_two_places(app_module):
    """Whatever the rounding mode at the midpoint, the result must be cent-exact."""
    for raw in ('10.005', '2.675', '0.125', '19.999', '1e3'):
        value = app_module.parse_money(raw)
        assert value == round(value, 2)


def test_partial_sell_leaves_clean_remainder(make_position, sell, client):
    pos = make_position(shares='13.972', total_buy='4600.95')

    resp = sell(pos['id'], shares=13, total_sell='4300')
    assert resp.status_code == 201

    remaining = client.get('/positions').get_json()[0]
    assert remaining['shares'] == 0.972, f"got {remaining['shares']!r}"


def test_can_sell_the_exact_remainder(make_position, sell, client):
    """The regression: 0.972 must not read as > the stored remainder."""
    pos = make_position(shares='13.972', total_buy='4600.95')
    sell(pos['id'], shares=13, total_sell='4300')

    resp = sell(pos['id'], shares='0.972', total_sell='320.08')
    assert resp.status_code == 201, resp.get_json()
    assert client.get('/positions').get_json() == [], 'position should be fully closed'


def test_oversell_is_still_rejected(make_position, sell):
    pos = make_position(shares='10', total_buy='1000')
    resp = sell(pos['id'], shares='10.5', total_sell='1100')
    assert resp.status_code == 400
    assert 'shares' in resp.get_json()['error']


@pytest.mark.parametrize('bad', ['0', '-1'])
def test_nonpositive_sell_rejected(make_position, sell, bad):
    pos = make_position(shares='10', total_buy='1000')
    assert sell(pos['id'], shares=bad, total_sell='100').status_code == 400
