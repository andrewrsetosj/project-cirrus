# Project Cirrus

A personal stock trade tracking dashboard built with Flask and React. Track open positions and closed trades, log P&L, and view live market prices and historical performance.

## Features

- Log and manage open positions and closed trades
- Real-time price and daily change via Yahoo Finance
- Week, month, 6-month, and 1-year performance history per symbol
- Symbol search autocomplete

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize the database
python init_db.py

# Run the app
python app.py
```

Then open http://localhost:8080 in your browser.

## Stack

- **Backend:** Python, Flask, SQLite
- **Frontend:** React
- **Data:** Yahoo Finance (unofficial API)
