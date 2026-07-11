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


async def get_klines_date_range(
    symbol: str,
    interval: str = "1m",
    start_ts: int = 0,   # Unix ms
    end_ts: int = 0,     # Unix ms
) -> list:
    """
    Fetch ALL klines between start_ts and end_ts by paginating Binance in 1000-candle chunks.
    Binance limit is max 1000 candles per request — this function handles pagination automatically.

    Returns: list of [timestamp_ms, open, high, low, close, volume] (floats)
    """
    if end_ts <= 0:
        end_ts = int(time.time() * 1000)
    if start_ts <= 0:
        raise ValueError("start_ts must be a positive Unix timestamp in ms")

    all_candles: list = []
    current_start = start_ts
    MAX_PER_REQUEST = 1000

    logger.info(f"[{symbol}/{interval}] Fetching date range: {start_ts} → {end_ts}")

    async with httpx.AsyncClient(timeout=20.0) as client:
        while current_start < end_ts:
            params = {
                "symbol": symbol,
                "interval": interval,
                "startTime": current_start,
                "endTime": end_ts,
                "limit": MAX_PER_REQUEST,
            }
            try:
                resp = await client.get(BASE_URL, params=params)
                resp.raise_for_status()
                batch = resp.json()
            except Exception as e:
                logger.error(f"[{symbol}] Pagination fetch failed at {current_start}: {e}")
                break

            if not batch:
                break

            parsed = [
                [int(d[0]), float(d[1]), float(d[2]), float(d[3]), float(d[4]), float(d[5])]
                for d in batch
            ]
            all_candles.extend(parsed)

            last_ts = int(batch[-1][0])
            if last_ts >= end_ts or len(batch) < MAX_PER_REQUEST:
                break

            # Advance to next candle after last batch
            current_start = last_ts + 1
            await asyncio.sleep(0.12)  # Respect Binance rate limit (1200 req/min)

    logger.info(f"[{symbol}/{interval}] Fetched {len(all_candles)} candles total")
    return all_candles
