"""
routers/backtest.py — Backtest engine router
Strategies: macd, rsi, kronos
Supports both:
  - limit-based: last N candles of an interval
  - date-range:  all 1m candles from start_date to end_date
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from backtest_engine import BacktestEngine
from binance_api import get_historical_klines, get_mtf_klines, get_klines_date_range
from auth import get_current_user
from kronos_onnx import ModelEnsemble
import pandas as pd
import numpy as np
import os
from datetime import datetime, timezone

router = APIRouter()

VALID_STRATEGIES = {"macd", "rsi", "kronos"}
VALID_MODELS = {"lstm", "xgboost", "transformer", "tcn"}
VALID_INTERVALS = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"}

# Shared model ensemble (loaded once per process)
_ensemble = ModelEnsemble(models_dir=os.path.dirname(os.path.abspath(__file__)) + "/..")

# Max candles for date-range mode to avoid memory/timeout issues
MAX_DATERANGE_CANDLES = 50_000   # ~35 days of 1m


class BacktestRequest(BaseModel):
    strategy: str
    symbol: str = Field(default="BTCUSDT", min_length=3, max_length=20)

    # --- Mode A: limit-based (default) ---
    interval: str = Field(default="1h")
    limit: int = Field(default=1000, ge=100, le=5000)

    # --- Mode B: date-range with 1m candles ---
    start_date: str | None = Field(
        default=None,
        description="ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS). Enables date-range mode."
    )
    end_date: str | None = Field(
        default=None,
        description="ISO date string. Defaults to now if start_date is set."
    )

    model_type: str = Field(default="lstm")

    @field_validator("strategy")
    @classmethod
    def validate_strategy(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in VALID_STRATEGIES:
            raise ValueError(f"strategy must be one of {VALID_STRATEGIES}")
        return v

    @field_validator("symbol")
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator("interval")
    @classmethod
    def validate_interval(cls, v: str) -> str:
        if v not in VALID_INTERVALS:
            raise ValueError(f"interval must be one of {VALID_INTERVALS}")
        return v

    @field_validator("model_type")
    @classmethod
    def validate_model(cls, v: str) -> str:
        v = v.lower().strip()   # Normalise to lowercase regardless of frontend
        if v not in VALID_MODELS:
            raise ValueError(f"model_type must be one of {VALID_MODELS}")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and not self.end_date:
            # Default end_date to now
            self.end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return self


def _parse_date(s: str) -> int:
    """Parse ISO date string → Unix timestamp in milliseconds."""
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {s}. Use YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS")


def _klines_to_df(data) -> pd.DataFrame:
    """Convert raw klines list/array to DataFrame with proper types."""
    df = pd.DataFrame(data, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"].astype(np.int64), unit="ms")
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna()


@router.post("/run")
async def run_backtest(req: BacktestRequest, current_user_email: str = Depends(get_current_user)):
    try:
        use_date_range = req.start_date is not None

        # ── Fetch OHLCV data ──────────────────────────────────────────────────
        if use_date_range:
            start_ts = _parse_date(req.start_date)
            end_ts = _parse_date(req.end_date)

            if end_ts <= start_ts:
                raise HTTPException(400, "end_date must be after start_date")

            # Estimate candle count to guard against extreme ranges
            interval_ms = 60_000  # 1m in ms
            estimated = (end_ts - start_ts) // interval_ms
            if estimated > MAX_DATERANGE_CANDLES:
                days = estimated // 1440
                raise HTTPException(
                    400,
                    f"Date range too large (~{days} days of 1m data = {estimated:,} candles). "
                    f"Max is {MAX_DATERANGE_CANDLES:,} candles (~{MAX_DATERANGE_CANDLES // 1440} days). "
                    "Reduce the range or use a coarser interval."
                )

            raw = await get_klines_date_range(
                symbol=req.symbol,
                interval="1m",
                start_ts=start_ts,
                end_ts=end_ts,
            )
            if len(raw) < 50:
                raise HTTPException(400, f"Not enough data: only {len(raw)} candles in range")

            df = _klines_to_df(raw)
            fetch_summary = f"{len(df):,} × 1m candles ({req.start_date} → {req.end_date})"

        else:
            raw = await get_historical_klines(
                symbol=req.symbol,
                interval=req.interval,
                limit=req.limit,
            )
            if len(raw) == 0:
                raise HTTPException(400, "No historical data found")
            df = _klines_to_df(raw.tolist())
            fetch_summary = f"{len(df):,} × {req.interval} candles (last {req.limit})"

        # ── Run strategy ──────────────────────────────────────────────────────
        engine = BacktestEngine(initial_balance=10_000.0, maker_fee=0.001, taker_fee=0.001)

        if req.strategy == "macd":
            result = engine.run_macd_crossover(df)

        elif req.strategy == "rsi":
            result = engine.run_rsi_mean_reversion(df)

        elif req.strategy == "kronos":
            # MTF data for AI-driven backtest (always fetches live MTF regardless of mode)
            mtf_data = await get_mtf_klines(symbol=req.symbol)
            result = await engine.run_kronos_strategy(
                df=df,
                mtf_data=mtf_data,
                ensemble_model=_ensemble,
                model_type=req.model_type,
                symbol=req.symbol,
            )

        else:
            raise HTTPException(400, "Unknown strategy")

        # ── Serialise timestamps ──────────────────────────────────────────────
        for trade in result.get("trades", []):
            if hasattr(trade.get("time"), "isoformat"):
                trade["time"] = trade["time"].isoformat()
        for point in result.get("equity_curve", []):
            if hasattr(point.get("time"), "isoformat"):
                point["time"] = point["time"].isoformat()

        return {
            "status": "success",
            "strategy": req.strategy,
            "symbol": req.symbol,
            "mode": "date_range" if use_date_range else "limit",
            "fetch_summary": fetch_summary,
            "data": result,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
