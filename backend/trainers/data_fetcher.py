import httpx
import asyncio
import pandas as pd
import os
import time

async def fetch_historical_klines(symbol="BTCUSDT", interval="1m", target_candles=200000):
    """
    Kéo hàng loạt dữ liệu nến bằng Pagination từ API Binance.
    """
    url = "https://api.binance.com/api/v3/klines"
    limit = 1000
    all_data = []
    
    # We will fetch going backwards from now.
    # Binance uses endTime in milliseconds.
    end_time = int(time.time() * 1000)
    
    print(f"Starting fetch for {symbol} interval {interval}...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        while len(all_data) < target_candles:
            params = {
                "symbol": symbol,
                "interval": interval,
                "limit": limit,
                "endTime": end_time
            }
            
            try:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if not data:
                    print("No more data from API.")
                    break
                
                all_data = data + all_data
                print(f"Fetched: {len(all_data)} / {target_candles} candles.")
                
                end_time = data[0][0] - 1
                await asyncio.sleep(0.5)
                
            except Exception as e:
                print(f"Error fetching: {e}")
                await asyncio.sleep(2)
                
    columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_av', 'trades', 'tb_base_av', 'tb_quote_av', 'ignore']
    df = pd.DataFrame(all_data, columns=columns)
    
    df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)
        
    df.drop_duplicates(subset=['timestamp'], inplace=True)
    df.sort_values('timestamp', inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    if len(df) > target_candles:
        df = df.iloc[-target_candles:]
        df.reset_index(drop=True, inplace=True)
        
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    save_dir = os.getenv("DATA_DIR", os.path.join(base_dir, "candle_data"))
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, f"{symbol}_{interval}_raw.csv")
    
    df.to_csv(save_path, index=False)
    print(f"Done! Saved {len(df)} candles to {save_path}")
    
    return df

if __name__ == "__main__":
    symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PAXGUSDT']
    target = 500000  # ~347 days
    
    async def fetch_all():
        for sym in symbols:
            print(f"\n{'='*50}\nStarting download {sym}\n{'='*50}")
            await fetch_historical_klines(symbol=sym, interval="1m", target_candles=target)
            
    asyncio.run(fetch_all())
