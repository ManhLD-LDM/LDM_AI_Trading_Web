import httpx
import numpy as np
import time
import asyncio

# Simple in-memory TTL cache to avoid hitting Binance API too frequently
_cache = {}
_cache_ttl = 10 # seconds
_cache_lock = asyncio.Lock()

async def get_historical_klines(symbol: str = "BTCUSDT", interval: str = "1m", limit: int = 512):
    """
    Kéo dữ liệu nến lịch sử từ Binance REST API với In-Memory TTL Cache (10s).
    Trả về numpy array.
    """
    cache_key = f"{symbol}_{interval}_{limit}"
    
    async with _cache_lock:
        if cache_key in _cache:
            entry = _cache[cache_key]
            if time.time() - entry['timestamp'] < _cache_ttl:
                return entry['data']

    url = f"https://api.binance.com/api/v3/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        ohlcv = []
        for d in data:
            ohlcv.append([
                float(d[0]), # Open time
                float(d[1]), # Open
                float(d[2]), # High
                float(d[3]), # Low
                float(d[4]), # Close
                float(d[5]), # Volume
            ])
            
        result = np.array(ohlcv, dtype=np.float32)
        
        async with _cache_lock:
            _cache[cache_key] = {
                'timestamp': time.time(),
                'data': result
            }
            
        return result
