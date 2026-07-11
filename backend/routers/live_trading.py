"""
backend/routers/live_trading.py

Live Trading API Router.
Tất cả endpoints đều require JWT auth.

CẢNH BÁO: testnet=False sẽ dùng tiền thật trên Binance!
Chỉ bật khi đã paper trading > 30 ngày và win rate > 50%.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from auth import get_current_user
from database import get_database, is_connected
from risk_manager import default_risk_manager, get_user_risk_state
from alert_manager import alert_manager
from datetime import datetime, timezone
from logger import setup_logger
import re

router = APIRouter()
logger = setup_logger("ldm.live")

VALID_SYMBOL_RE = re.compile(r"^[A-Z]{2,20}$")


# ─── Pydantic models ───────────────────────────────────────────────────────────

class LiveTradeRequest(BaseModel):
    symbol: str = Field(..., min_length=3, max_length=20)
    usdt_amount: float = Field(..., gt=10.0, le=10_000.0, description="USDT amount to trade")
    stop_loss_pct: float = Field(default=0.02, ge=0.005, le=0.10, description="Stop loss %")
    take_profit_pct: float = Field(default=0.04, ge=0.01, le=0.50, description="Take profit %")
    testnet: bool = Field(default=True, description="True=testnet, False=LIVE real money")
    ai_confidence: float = Field(default=100.0, ge=0.0, le=100.0, description="AI confidence score (for risk check)")

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        v = v.upper().strip()
        if not VALID_SYMBOL_RE.match(v):
            raise ValueError("Symbol must be uppercase letters only (e.g. BTCUSDT)")
        return v


class SellRequest(BaseModel):
    symbol: str = Field(..., min_length=3, max_length=20)
    quantity: float = Field(..., gt=0, description="Asset quantity to sell")
    testnet: bool = Field(default=True)

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        v = v.upper().strip()
        if not VALID_SYMBOL_RE.match(v):
            raise ValueError("Symbol must be uppercase letters only")
        return v


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _get_executor(user_email: str, testnet: bool):
    """
    Load user's encrypted Binance API keys from DB and create executor.
    Raises 400 if keys not configured, 500 if decryption fails.
    """
    if not is_connected():
        raise HTTPException(503, "Database unavailable. Cannot load API keys.")

    db = get_database()
    user = await db["users"].find_one({"email": user_email})

    if not user or not user.get("binance_api_key"):
        raise HTTPException(
            400,
            "Binance API keys not configured. "
            "Go to Settings → API Keys to add your Binance keys."
        )

    try:
        from exchange.key_manager import decrypt_key
        api_key = decrypt_key(user["binance_api_key"])
        api_secret = decrypt_key(user["binance_api_secret"])
    except ValueError as e:
        raise HTTPException(500, f"API key decryption failed: {e}")

    from exchange.binance_executor import BinanceExecutor
    return BinanceExecutor(api_key, api_secret, testnet=testnet)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/buy")
async def live_buy(req: LiveTradeRequest, current_user_email: str = Depends(get_current_user)):
    """
    Đặt Market BUY với auto OCO (SL + TP).
    Bắt buộc qua Risk Manager khi testnet=False.
    """
    executor = await _get_executor(current_user_email, req.testnet)

    # Lấy USDT balance thực tế
    usdt_balance = await executor.get_usdt_balance()

    # ── Risk check (chỉ enforce với LIVE, không testnet) ──────────────────
    if not req.testnet:
        if not is_connected():
            raise HTTPException(503, "DB required for risk check on live trades")

        # Estimate quantity for check
        current_price = await executor.get_current_price(req.symbol)
        estimated_qty = req.usdt_amount / current_price if current_price > 0 else 0

        # Load per-user risk state (in-memory session tracking)
        state = get_user_risk_state(current_user_email)

        result_risk = default_risk_manager.check(
            symbol=req.symbol,
            action="buy",
            quantity=estimated_qty,
            price=current_price,
            balance=usdt_balance,
            positions={},
            state=state,
        )
        if not result_risk.allowed:
            logger.warning(f"[LIVE] Trade BLOCKED for {current_user_email}: {result_risk.reason}")
            raise HTTPException(400, f"Risk Manager blocked trade: {result_risk.reason}")

    # ── Execute order ─────────────────────────────────────────────────────
    result = await executor.place_market_buy_with_oco(
        symbol=req.symbol,
        usdt_amount=req.usdt_amount,
        stop_loss_pct=req.stop_loss_pct,
        take_profit_pct=req.take_profit_pct,
    )

    if not result["success"]:
        logger.error(f"[LIVE] BUY failed for {current_user_email}: {result.get('error')}")
        raise HTTPException(400, result.get("error", "Order execution failed"))

    # ── Persist to DB ─────────────────────────────────────────────────────
    if is_connected():
        db = get_database()
        await db["live_trades"].insert_one({
            "email": current_user_email,
            "action": "buy",
            "testnet": req.testnet,
            "timestamp": datetime.now(timezone.utc),
            **result,
        })

    # ── Alert ─────────────────────────────────────────────────────────────
    mode_label = "TESTNET" if req.testnet else "LIVE"
    await alert_manager.send_signal_alert(
        symbol=req.symbol,
        action="BUY",
        price=result.get("fill_price", 0),
        confidence=req.ai_confidence,
        reason=f"[{mode_label}] Market BUY executed. TP={result.get('take_profit')}, SL={result.get('stop_loss')}",
        model_type=mode_label,
    )

    return result


@router.post("/sell")
async def live_sell(req: SellRequest, current_user_email: str = Depends(get_current_user)):
    """Market SELL — exit thủ công."""
    executor = await _get_executor(current_user_email, req.testnet)

    result = await executor.place_market_sell(
        symbol=req.symbol,
        quantity=req.quantity,
    )

    if not result["success"]:
        raise HTTPException(400, result.get("error", "Sell order failed"))

    if is_connected():
        db = get_database()
        await db["live_trades"].insert_one({
            "email": current_user_email,
            "action": "sell",
            "testnet": req.testnet,
            "timestamp": datetime.now(timezone.utc),
            **result,
        })

    mode_label = "TESTNET" if req.testnet else "LIVE"
    await alert_manager.send_signal_alert(
        symbol=req.symbol,
        action="SELL",
        price=result.get("fill_price", 0),
        confidence=100,
        reason=f"[{mode_label}] Manual SELL executed.",
        model_type=mode_label,
    )

    return result


@router.get("/balance")
async def live_balance(
    testnet: bool = True,
    current_user_email: str = Depends(get_current_user)
):
    """Lấy balance thực tế từ Binance account."""
    executor = await _get_executor(current_user_email, testnet)
    balances = await executor.get_account_balance()
    usdt = balances.get("USDT", {}).get("free", 0.0)
    return {
        "balances": balances,
        "usdt_free": usdt,
        "testnet": testnet,
    }


@router.get("/orders/open")
async def get_open_orders(
    symbol: str | None = None,
    testnet: bool = True,
    current_user_email: str = Depends(get_current_user)
):
    """Lấy danh sách open orders, optional filter theo symbol."""
    executor = await _get_executor(current_user_email, testnet)
    orders = await executor.get_open_orders(symbol=symbol.upper() if symbol else None)
    return {"orders": orders, "count": len(orders)}


@router.delete("/orders/{symbol}")
async def cancel_orders(
    symbol: str,
    testnet: bool = True,
    current_user_email: str = Depends(get_current_user)
):
    """Hủy tất cả open orders cho symbol (kể cả OCO)."""
    sym = symbol.upper().strip()
    if not VALID_SYMBOL_RE.match(sym):
        raise HTTPException(400, "Invalid symbol format")
    executor = await _get_executor(current_user_email, testnet)
    cancelled = await executor.cancel_all_open_orders(sym)
    return {"cancelled": cancelled, "symbol": sym}


@router.get("/history")
async def live_history(
    limit: int = 50,
    current_user_email: str = Depends(get_current_user)
):
    """Lấy lịch sử live trades từ DB."""
    if not is_connected():
        return {"trades": [], "mock": True}

    db = get_database()
    cursor = db["live_trades"].find(
        {"email": current_user_email},
        sort=[("timestamp", -1)],
        limit=min(limit, 200),
    )
    trades = await cursor.to_list(min(limit, 200))
    for t in trades:
        t.pop("_id", None)
        if isinstance(t.get("timestamp"), datetime):
            t["timestamp"] = t["timestamp"].isoformat()
    return {"trades": trades, "count": len(trades)}
