"""Shared fixtures: every test runs against a throwaway SQLite file.

app.DB is a module-level constant read by get_db() on each call, so pointing it
at a tmp_path gives full isolation without touching the real trades.db.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _load_app():
    """Import app.py fresh so each test session gets its own module object."""
    spec = importlib.util.spec_from_file_location('cirrus_app', ROOT / 'app.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules['cirrus_app'] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def app_module(tmp_path, monkeypatch):
    module = _load_app()
    monkeypatch.setattr(module, 'DB', str(tmp_path / 'test.db'))
    module.ensure_tables()
    return module


@pytest.fixture
def client(app_module):
    app_module.app.config['TESTING'] = True
    return app_module.app.test_client()


@pytest.fixture
def db(app_module):
    """Direct connection for asserting stored values without going through HTTP."""
    def _open():
        return app_module.get_db()
    return _open


# ── Builders ──────────────────────────────────────────────────────────────────

@pytest.fixture
def make_position(client):
    def _make(symbol='PANW', open_date='2026-01-02', shares='10', total_buy='1000',
              account='ira'):
        resp = client.post('/positions', json={
            'symbol': symbol, 'open_date': open_date,
            'shares': shares, 'total_buy': total_buy, 'account': account,
        })
        assert resp.status_code == 201, resp.get_json()
        return resp.get_json()
    return _make


@pytest.fixture
def sell(client):
    def _sell(pos_id, shares=None, total_sell='1100', close_date='2026-03-01'):
        body = {'close_date': close_date, 'total_sell': total_sell}
        if shares is not None:
            body['shares'] = str(shares)
        return client.post(f'/positions/{pos_id}/close', json=body)
    return _sell
