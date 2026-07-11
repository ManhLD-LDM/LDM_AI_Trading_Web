import httpx
import numpy as np
import time
import asyncio
from logger import setup_logger

logger = setup_logger("ldm.binance")

# Simple in-memory TTL cache to avoid hitting Binance API too frequently
_cache = {}
_cache_ttl = 10  # seconds
_cache_lock = asyncio.Lock()

BASE_URL = "https://api.binance.com/api/v3/klines"


async def get_historical_klines(symbol: str = "BTCUSDT", interval: str = "1m", limit: int = 512):
    """
    Fetch historical klines from Binance REST API with in-memory TTL cache (10s).
    Returns numpy array (backward compatible).
    """
    cache_key = f"{symbol}_{interval}_{limit}"

    async with _cache_lock:
        if cache_key in _cache:
            entry = _cache[cache_key]
            if time.time() - entry['timestamp'] < _cache_ttl:
                return entry['data']

    params = {"symbol": symbol, "interval": interval, "limit": limit}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()

        ohlcv = [
            [float(d[0]), float(d[1]), float(d[2]), float(d[3]), float(d[4]), float(d[5])]
            for d in data
        ]

        result = np.array(ohlcv, dtype=np.float32)

        async with _cache_lock:
            _cache[cache_key] = {'timestamp': time.time(), 'data': result}

        return result


async def get_mtf_klines(
    symbol: str,
    intervals: list | None = None,
    limit: int = 100
) -> dict:
    """
    Fetch klines for multiple timeframes concurrently.
    Used for proper MTF feature engineering in ML models.

    Returns: {"1m": [[ts,o,h,l,c,v],...], "5m": [...], "15m": [...], "1h": [...], "4h": [...]}
    """
    if intervals is None:
        intervals = ['1m', '5m', '15m', '1h', '4h']

    async def _fetch_one(iv: str):
        params = {"symbol": symbol, "interval": iv, "limit": limit}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(BASE_URL, params=params)
                resp.raise_for_status()
                data = resp.json()
                parsed = [
                    [int(d[0]), float(d[1]), float(d[2]), float(d[3]), float(d[4]), float(d[5])]
                    for d in data
                ]
                return iv, parsed
        except Exception as e:
            logger.warning(f"MTF fetch failed {symbol}/{iv}: {e}")
            return iv, []

    tasks = [_fetch_one(iv) for iv in intervals]
    results = await asyncio.gather(*tasks)
    return dict(results)
