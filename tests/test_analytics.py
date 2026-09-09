"""Analytics tests use small hand-checkable inputs rather than market data, so a
failure points at the formula instead of at Yahoo.
"""
import pytest

import analytics as an


DAYS = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']


# ── forward fill ──────────────────────────────────────────────────────────────

def test_forward_fill_carries_last_close_over_gaps():
    filled = an.forward_filled({'2026-01-02': 10.0, '2026-01-06': 12.0}, DAYS)
    assert filled == {'2026-01-02': 10.0, '2026-01-05': 10.0,
                      '2026-01-06': 12.0, '2026-01-07': 12.0}


def test_forward_fill_omits_days_before_first_close():
    filled = an.forward_filled({'2026-01-06': 12.0}, DAYS)
    assert '2026-01-02' not in filled and filled['2026-01-07'] == 12.0


# ── split un-adjustment ───────────────────────────────────────────────────────

def test_prices_before_a_split_are_scaled_back_to_traded_terms():
    """CRWD's real case: bought near 572, 4:1 split, Yahoo restates history /4."""
    history = {'2026-05-22': 165.87, '2026-07-01': 170.00, '2026-07-02': 42.00}
    out = an.unadjust_splits(history, {'2026-07-02': 4.0})
    assert out['2026-05-22'] == pytest.approx(663.48)   # back in pre-split dollars
    assert out['2026-07-01'] == pytest.approx(680.00)
    assert out['2026-07-02'] == pytest.approx(42.00)    # on/after the split, unchanged


def test_multiple_splits_compound():
    out = an.unadjust_splits({'2024-01-02': 10.0},
                             {'2024-06-10': 10.0, '2026-07-02': 4.0})
    assert out['2024-01-02'] == pytest.approx(400.0)


def test_no_splits_is_a_passthrough():
    history = {'2026-01-02': 10.0, '2026-01-05': 11.0}
    assert an.unadjust_splits(history, {}) == history


def test_split_unadjustment_removes_the_phantom_loss():
    """A lot bought pre-split must not read as a 75% loss after a 4:1."""
    positions = [{'symbol': 'C', 'open_date': '2026-01-02', 'shares': 6, 'total_buy': 3432.51}]
    adjusted = {'C': {d: 143.02 for d in DAYS}}          # 572.09 / 4
    corrected = {'C': an.unadjust_splits(adjusted['C'], {'2026-07-02': 4.0})}

    naive = an.build_daily_series(DAYS, positions, [], [], [], adjusted)
    fixed = an.build_daily_series(DAYS, positions, [], [], [], corrected)

    assert naive[-1]['unrealized'] == pytest.approx(-2574.39, abs=0.05)   # fictitious
    assert fixed[-1]['unrealized'] == pytest.approx(0.0, abs=0.05)        # flat, as it should be


# ── holdings ──────────────────────────────────────────────────────────────────

def test_closed_trade_is_held_up_to_but_not_on_close_date():
    trades = [{'symbol': 'X', 'open_date': '2026-01-02', 'close_date': '2026-01-06',
               'shares': 1, 'total_buy': 10, 'total_sell': 12}]
    assert len(an.holdings_on('2026-01-05', [], trades)) == 1
    assert an.holdings_on('2026-01-06', [], trades) == []


def test_position_counts_from_its_open_date():
    pos = [{'symbol': 'X', 'open_date': '2026-01-05', 'shares': 1, 'total_buy': 10}]
    assert an.holdings_on('2026-01-02', pos, []) == []
    assert len(an.holdings_on('2026-01-05', pos, [])) == 1


# ── series construction ───────────────────────────────────────────────────────

def test_value_tracks_price_moves_on_an_open_position():
    positions = [{'symbol': 'X', 'open_date': '2026-01-02', 'shares': 10, 'total_buy': 100.0}]
    contributions = [{'date': '2026-01-02', 'amount': 100.0}]
    prices = {'X': {'2026-01-02': 10.0, '2026-01-05': 11.0,
                    '2026-01-06': 9.0, '2026-01-07': 10.0}}
    s = an.build_daily_series(DAYS, positions, [], contributions, [], prices)

    assert [r['value'] for r in s] == [100.0, 110.0, 90.0, 100.0]
    assert s[0]['flow'] == 100.0 and s[1]['flow'] == 0.0


def test_realized_gain_lands_on_close_date():
    trades = [{'symbol': 'X', 'open_date': '2026-01-02', 'close_date': '2026-01-06',
               'shares': 10, 'total_buy': 100.0, 'total_sell': 130.0}]
    contributions = [{'date': '2026-01-02', 'amount': 100.0}]
    prices = {'X': {d: 10.0 for d in DAYS}}
    s = an.build_daily_series(DAYS, [], trades, contributions, [], prices)

    assert [r['realized'] for r in s] == [0.0, 0.0, 30.0, 30.0]
    assert [r['value'] for r in s] == [100.0, 100.0, 130.0, 130.0]


def test_unpriced_holding_is_carried_at_cost_not_dropped():
    positions = [{'symbol': 'MISSING', 'open_date': '2026-01-02', 'shares': 5, 'total_buy': 250.0}]
    s = an.build_daily_series(DAYS, positions, [], [{'date': '2026-01-02', 'amount': 250.0}], [], {})
    assert all(r['value'] == 250.0 for r in s)


def test_income_adds_to_value():
    s = an.build_daily_series(
        DAYS, [], [], [{'date': '2026-01-02', 'amount': 100.0}],
        [{'date': '2026-01-06', 'amount': 5.0}], {})
    assert [r['value'] for r in s] == [100.0, 100.0, 105.0, 105.0]


# ── returns ───────────────────────────────────────────────────────────────────

def test_deposit_does_not_register_as_a_gain():
    """The property that makes TWR the right measure: value doubles, return is 0."""
    series = [{'date': 'a', 'value': 100.0, 'flow': 100.0},
              {'date': 'b', 'value': 200.0, 'flow': 100.0}]
    assert an.daily_returns(series) == [pytest.approx(0.0)]


def test_returns_compound_into_the_growth_index():
    series = [{'date': 'a', 'value': 100.0, 'flow': 0.0},
              {'date': 'b', 'value': 110.0, 'flow': 0.0},
              {'date': 'c', 'value': 121.0, 'flow': 0.0}]
    assert an.daily_returns(series) == [pytest.approx(0.1), pytest.approx(0.1)]
    assert an.growth_index(series)[-1] == pytest.approx(1.21)


def test_days_with_no_capital_are_skipped():
    series = [{'date': 'a', 'value': 0.0, 'flow': 0.0},
              {'date': 'b', 'value': 100.0, 'flow': 100.0},
              {'date': 'c', 'value': 110.0, 'flow': 0.0}]
    assert an.daily_returns(series) == [pytest.approx(0.1)]


# ── drawdown ──────────────────────────────────────────────────────────────────

def test_max_drawdown_measures_peak_to_trough():
    assert an.max_drawdown([1.0, 1.5, 0.75, 1.2]) == pytest.approx(-0.5)


def test_max_drawdown_is_zero_when_only_rising():
    assert an.max_drawdown([1.0, 1.1, 1.2]) == 0.0


def test_drawdown_survives_a_deposit_during_a_decline():
    """On raw value the deposit would hide the fall; on the growth index it can't."""
    series = [{'date': 'a', 'value': 100.0, 'flow': 0.0},
              {'date': 'b', 'value': 80.0,  'flow': 0.0},
              {'date': 'c', 'value': 180.0, 'flow': 100.0}]
    assert [r['value'] for r in series] == [100.0, 80.0, 180.0]   # raw value ends higher
    assert an.max_drawdown(an.growth_index(series)) == pytest.approx(-0.2)


# ── beta ──────────────────────────────────────────────────────────────────────

def test_beta_of_identical_series_is_one():
    r = [0.01, -0.02, 0.015, 0.004, -0.008]
    assert an.beta(r, r) == pytest.approx(1.0)


def test_beta_scales_with_amplitude():
    b = [0.01, -0.02, 0.015, 0.004, -0.008]
    assert an.beta([2 * x for x in b], b) == pytest.approx(2.0)


def test_beta_needs_a_moving_benchmark():
    assert an.beta([0.01, 0.02], [0.0, 0.0]) is None


# ── stats ─────────────────────────────────────────────────────────────────────

def test_stats_on_a_flat_series_are_zero_not_none():
    series = [{'date': str(i), 'value': 100.0, 'flow': 0.0} for i in range(10)]
    st = an.performance_stats(series)
    assert st['twr'] == pytest.approx(0.0)
    assert st['volatility'] == pytest.approx(0.0)
    assert st['max_drawdown'] == pytest.approx(0.0)
    assert st['sharpe'] is None          # undefined at zero volatility


def test_stats_handle_a_series_too_short_to_have_returns():
    st = an.performance_stats([{'date': 'a', 'value': 100.0, 'flow': 100.0}])
    assert st['twr'] is None and st['sharpe'] is None


def test_sharpe_is_annualized_mean_excess_over_volatility():
    series = [{'date': 'a', 'value': 100.0, 'flow': 0.0},
              {'date': 'b', 'value': 110.0, 'flow': 0.0},
              {'date': 'c', 'value': 105.0, 'flow': 0.0},
              {'date': 'd', 'value': 115.0, 'flow': 0.0}]
    st = an.performance_stats(series, risk_free=0.0)
    rets = an.daily_returns(series)
    expected = (sum(rets) / len(rets)) * an.TRADING_DAYS / st['volatility']
    assert st['sharpe'] == pytest.approx(expected)


def test_short_history_is_not_annualized():
    """A few days of return must not be compounded out to a yearly figure."""
    series = [{'date': str(i), 'value': 100.0 * (2 ** i), 'flow': 0.0} for i in range(4)]
    st = an.performance_stats(series)
    assert st['twr'] == pytest.approx(7.0)      # 100 -> 800
    assert st['twr_annualized'] is None


def test_long_enough_history_is_annualized():
    # ~1 year of +0.05%/day
    series = [{'date': str(i), 'value': 100.0 * (1.0005 ** i), 'flow': 0.0}
              for i in range(an.TRADING_DAYS + 1)]
    st = an.performance_stats(series)
    assert st['twr_annualized'] == pytest.approx(1.0005 ** an.TRADING_DAYS - 1, rel=1e-6)


def test_risk_free_rate_lowers_sharpe():
    series = [{'date': str(i), 'value': 100.0 + i, 'flow': 0.0} for i in range(20)]
    assert an.performance_stats(series, risk_free=0.05)['sharpe'] < \
           an.performance_stats(series, risk_free=0.0)['sharpe']


# ── fund simulation ───────────────────────────────────────────────────────────

def test_fund_buys_at_each_contribution_date():
    hist = {'2026-01-02': 10.0, '2026-01-05': 20.0, '2026-01-06': 20.0, '2026-01-07': 40.0}
    contributions = [{'date': '2026-01-02', 'amount': 100.0},   # 10 shares
                     {'date': '2026-01-05', 'amount': 100.0}]   #  5 shares
    out = an.simulate_fund(DAYS, contributions, hist)
    assert out[-1]['value'] == pytest.approx(15 * 40.0)
    assert out[-1]['contributed'] == 200.0


def test_clamping_defers_early_contributions():
    hist = {'2026-01-02': 10.0, '2026-01-05': 20.0, '2026-01-06': 20.0, '2026-01-07': 20.0}
    contributions = [{'date': '2026-01-02', 'amount': 100.0}]

    unclamped = an.simulate_fund(DAYS, contributions, hist)
    clamped   = an.simulate_fund(DAYS, contributions, hist,
                                 first_invest_date='2026-01-05', clamped=True)

    assert unclamped[-1]['value'] == pytest.approx(200.0)   # 10 shares at 20
    assert clamped[-1]['value']   == pytest.approx(100.0)   #  5 shares at 20


def test_fund_reports_flows_so_its_return_is_time_weighted_too():
    """Without this the benchmark's own deposits would read as benchmark gains."""
    hist = {'2026-01-02': 10.0, '2026-01-05': 10.0, '2026-01-06': 10.0, '2026-01-07': 10.0}
    contributions = [{'date': '2026-01-02', 'amount': 100.0},
                     {'date': '2026-01-06', 'amount': 100.0}]
    out = an.simulate_fund(DAYS, contributions, hist)

    assert [r['flow'] for r in out] == [100.0, 0.0, 100.0, 0.0]
    # price never moved, so every time-weighted return must be zero
    assert an.daily_returns(out) == [pytest.approx(0.0)] * 3


def test_clamping_is_a_no_op_when_nothing_predates_the_first_trade():
    hist = {d: 10.0 for d in DAYS}
    contributions = [{'date': '2026-01-06', 'amount': 100.0}]
    a = an.simulate_fund(DAYS, contributions, hist, first_invest_date='2026-01-02', clamped=True)
    b = an.simulate_fund(DAYS, contributions, hist)
    assert [r['value'] for r in a] == [r['value'] for r in b]
