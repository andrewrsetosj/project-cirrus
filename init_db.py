import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), 'trades.db')

# Sample trades for development/testing — not real dataS
# Columns: symbol, open_date, close_date, shares, total_buy, total_sell
SEED_TRADES = [
    ('T',    '2024-05-28', '2026-04-15', 100, 1746.00, 2555.95),
    ('HD',   '2024-05-28', '2026-04-27', 5,   1626.95, 1671.19),
    ('DE',   '2024-05-28', '2026-04-27', 5,   1875.00, 2832.77),
    ('AAPL', '2024-05-28', '2026-05-20', 8,   1531.52, 2392.11),
    ('AAPL', '2024-05-28', '2026-05-29', 7,   1340.08, 2175.20),
    ('AAPL', '2024-05-28', '2026-04-15', 10,  1914.40, 2581.95),
    ('AMZN', '2024-09-12', '2026-05-14', 4,   740.00,  1069.32),
    ('YELP', '2024-10-16', '2026-02-09', 24,  830.40,  580.80),
    ('MSFT', '2026-04-15', '2026-05-11', 13,  5303.22, 5347.05),
    ('HD',   '2026-04-15', '2026-04-27', 3,   1025.55, 1002.72),
    ('AMX',  '2026-04-15', '2026-05-14', 100, 2592.00, 2751.94),
    ('HD',   '2026-04-21', '2026-04-27', 1,   352.93,  334.24),
    ('AAPL', '2026-04-22', '2026-05-29', 4,   1070.84, 1242.98),
    ('TSM',  '2026-04-27', '2026-05-29', 5,   2022.15, 2098.66),
    ('TSM',  '2026-04-27', '2026-05-20', 5,   2022.15, 2009.26),
    ('TSM',  '2026-04-27', '2026-05-13', 5,   2022.15, 1980.39),
    ('COKE', '2026-05-06', '2026-05-13', 3,   646.80,  501.95),
    ('PANW', '2026-05-11', '2026-05-19', 25,  5344.88, 6021.38),
    ('INTC', '2026-05-13', '2026-05-27', 21,  2544.47, 2520.99),
    ('CRWD', '2026-05-14', '2026-05-26', 6,   3432.51, 3913.12),
    ('AMX',  '2026-05-14', '2026-05-29', 14,  385.35,  350.55),
    ('PANW', '2026-05-20', '2026-05-26', 17,  4234.79, 4335.42),
    ('INTC', '2026-05-20', '2026-05-27', 29,  3454.48, 3481.39),
    ('CRWD', '2026-05-20', '2026-05-26', 4,   2505.62, 2608.75),
]

def init():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute('DROP TABLE IF EXISTS trades')
    cur.execute('''
        CREATE TABLE trades (
            id         INTEGER PRIMARY KEY,
            symbol     TEXT NOT NULL,
            open_date  TEXT NOT NULL,
            close_date TEXT NOT NULL,
            shares     INTEGER NOT NULL,
            total_buy  REAL NOT NULL,
            total_sell REAL NOT NULL
        )
    ''')
    cur.executemany(
        'INSERT INTO trades (symbol, open_date, close_date, shares, total_buy, total_sell) VALUES (?,?,?,?,?,?)',
        SEED_TRADES
    )
    conn.commit()
    conn.close()
    print(f'Seeded {len(SEED_TRADES)} trades into {DB}')

if __name__ == '__main__':
    init()
