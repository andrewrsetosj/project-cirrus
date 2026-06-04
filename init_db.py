import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), 'trades.db')

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
    cur.execute('''
        CREATE TABLE IF NOT EXISTS contributions (
            id     INTEGER PRIMARY KEY,
            date   TEXT NOT NULL,
            amount REAL NOT NULL,
            note   TEXT NOT NULL DEFAULT ''
        )
    ''')
    conn.commit()
    conn.close()
    print(f'Initialized database at {DB}')

if __name__ == '__main__':
    init()
