import numpy as np
import httpx
import asyncio

async def fetch_train_data(symbol="BTCUSDT", interval="4h", limit=1000):
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
    async with httpx.AsyncClient() as client:
        res = await client.get(url)
        data = res.json()
    ohlcv = np.array([[float(d[1]), float(d[2]), float(d[3]), float(d[4]), float(d[5])] for d in data])
    # Returns (pct_change)
    returns = np.diff(ohlcv[:, 3]) / ohlcv[:-1, 3]
    return ohlcv, returns

def create_sequences(data, seq_length=512):
    X, y = [], []
    for i in range(len(data) - seq_length - 1):
        X.append(data[i:(i + seq_length)])
        y.append(1 if data[i + seq_length + 1][3] > data[i + seq_length][3] else 0)
    return np.array(X), np.array(y)
