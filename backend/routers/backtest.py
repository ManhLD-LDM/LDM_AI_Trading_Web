"""
routers/backtest.py — Backtest engine router
Strategies: macd, rsi, kronos
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from backtest_engine import BacktestEngine
from binance_api import get_historical_klines, get_mtf_klines
from auth import get_current_user
from database import db
from kronos_onnx import ModelEnsemble
import pandas as pd
import os

router = APIRouter()

VALID_STRATEGIES = {"macd", "rsi", "kronos"}
VALID_MODELS = {"lstm", "xgboost", "transformer", "tcn"}

# Shared model ensemble (loaded once per process)
_ensemble = ModelEnsemble(models_dir=os.path.dirname(os.path.abspath(__file__)) + "/..")


class BacktestRequest(BaseModel):
    strategy: str
    symbol: str = Field(default="BTCUSDT", min_length=3, max_length=20)
    interval: str = Field(default="1h")
    limit: int = Field(default=1000, ge=100, le=5000)
    model_type: str = Field(default="lstm")

    @field_validator('strategy')
    @classmethod
    def validate_strategy(cls, v: str) -> str:
        v = v.lower()
        if v not in VALID_STRATEGIES:
            raise ValueError(f"strategy must be one of {VALID_STRATEGIES}")
        return v

    @field_validator('symbol')
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator('model_type')
    @classmethod
    def validate_model(cls, v: str) -> str:
        if v not in VALID_MODELS:
            raise ValueError(f"model_type must be one of {VALID_MODELS}")
        return v


@router.post("/run")
async def run_backtest(req: BacktestRequest, current_user_email: str = Depends(get_current_user)):
    try:
        history_data = await get_historical_klines(symbol=req.symbol, interval=req.interval, limit=req.limit)
        if len(history_data) == 0:
            raise HTTPException(status_code=400, detail="No historical data found")

        df = pd.DataFrame(history_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')

        engine = BacktestEngine(initial_balance=10_000.0, maker_fee=0.001, taker_fee=0.001)

        if req.strategy == "macd":
            result = engine.run_macd_crossover(df)
        elif req.strategy == "rsi":
            result = engine.run_rsi_mean_reversion(df)
        elif req.strategy == "kronos":
            # Fetch MTF data for model-driven backtest
            mtf_data = await get_mtf_klines(symbol=req.symbol)
            result = await engine.run_kronos_strategy(
                df=df,
                mtf_data=mtf_data,
                ensemble_model=_ensemble,
                model_type=req.model_type,
                symbol=req.symbol
            )
        else:
            raise HTTPException(status_code=400, detail="Unknown strategy")

        # Serialise timestamps in result
        for trade in result.get("trades", []):
            if hasattr(trade.get("time"), "isoformat"):
                trade["time"] = trade["time"].isoformat()
        for point in result.get("equity_curve", []):
            if hasattr(point.get("time"), "isoformat"):
                point["time"] = point["time"].isoformat()

        return {"status": "success", "strategy": req.strategy, "symbol": req.symbol, "data": result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
