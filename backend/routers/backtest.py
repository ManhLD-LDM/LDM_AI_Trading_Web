from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from backtest_engine import BacktestEngine
from binance_api import get_historical_klines
from auth import get_current_user
from database import db
import pandas as pd

router = APIRouter()

class BacktestRequest(BaseModel):
    strategy: str
    symbol: str
    interval: str
    limit: int = 1000

@router.post("/run")
async def run_backtest(req: BacktestRequest, current_user_email: str = Depends(get_current_user)):
    try:
        # Fetch historical data
        history_data = await get_historical_klines(symbol=req.symbol, interval=req.interval, limit=req.limit)
        if len(history_data) == 0:
            raise HTTPException(status_code=400, detail="No historical data found")

        df = pd.DataFrame(history_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        
        engine = BacktestEngine(initial_balance=10000.0, maker_fee=0.001, taker_fee=0.001)
        
        if req.strategy == "macd":
            result = engine.run_macd_crossover(df)
        elif req.strategy == "rsi":
            result = engine.run_rsi_mean_reversion(df)
        else:
            raise HTTPException(status_code=400, detail="Unknown strategy")
            
        return {"status": "success", "data": result}
    except Exception as e:
        print(f"Backtest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
