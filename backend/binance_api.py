import httpx
import numpy as np

async def get_historical_klines(symbol: str = "BTCUSDT", interval: str = "1m", limit: int = 512):
    """
    Kéo dữ liệu nến lịch sử từ Binance REST API.
    Trả về numpy array phù hợp để đưa vào model Kronos.
    """
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
        
        # Binance kline format:
        # [
        #   [
        #     1499040000000,      // Open time
        #     "0.01634790",       // Open
        #     "0.80000000",       // High
        #     "0.01575800",       // Low
        #     "0.01577100",       // Close
        #     "148976.11427815",  // Volume
        #     ...
        #   ]
        # ]
        
        # Chỉ lấy Open, High, Low, Close, Volume
        ohlcv = []
        for d in data:
            ohlcv.append([
                float(d[1]), # Open
                float(d[2]), # High
                float(d[3]), # Low
                float(d[4]), # Close
                float(d[5]), # Volume
            ])
            
        return np.array(ohlcv, dtype=np.float32)
