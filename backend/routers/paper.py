"""
routers/paper.py — Persistent Paper Trading
- POST /api/paper/execute   — execute a paper trade (buy/sell)
- GET  /api/paper/portfolio — get current balance, positions, and unrealised P&L
- GET  /api/paper/history   — paginated trade history
- POST /api/paper/reset     — reset portfolio to initial balance
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from auth import get_current_user
from database import get_database, db
from datetime import datetime, timezone
from bson import ObjectId
from risk_manager import default_risk_manager, get_user_risk_state, RiskConfig, RiskManager

router = APIRouter()

INITIAL_BALANCE = 10_000.0
TAKER_FEE = 0.001  # 0.1% Binance taker fee

VALID_ACTIONS = {"buy", "sell"}


class PaperTradeRequest(BaseModel):
    symbol: str = Field(..., min_length=3, max_length=20)
    action: str
    price: float = Field(..., gt=0)
    quantity: float = Field(..., gt=0)

    @field_validator('action')
    @classmethod
    def validate_action(cls, v: str) -> str:
        v = v.lower()
        if v not in VALID_ACTIONS:
            raise ValueError(f"action must be one of {VALID_ACTIONS}")
        return v

    @field_validator('symbol')
    @classmethod
    def uppercase_symbol(cls, v: str) -> str:
        return v.upper().strip()


def _serialise(doc: dict) -> dict:
    """Convert MongoDB ObjectId to string for JSON serialisation."""
    doc['_id'] = str(doc['_id'])
    return doc


async def _get_or_create_portfolio(email: str) -> dict:
    """Fetch user document, ensuring paper trading fields exist."""
    col = get_database()["users"]
    user = await col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "paper_balance" not in user:
        await col.update_one(
            {"email": email},
            {"$set": {"paper_balance": INITIAL_BALANCE, "paper_positions": {}}}
        )
        user["paper_balance"] = INITIAL_BALANCE
        user["paper_positions"] = {}
    return user


@router.post("/execute")
async def execute_paper_trade(req: PaperTradeRequest, current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"status": "success", "message": "Simulated — no DB connected"}

    user = await _get_or_create_portfolio(current_user_email)
    balance: float = user.get("paper_balance", INITIAL_BALANCE)
    positions: dict = user.get("paper_positions", {})

    fee = req.price * req.quantity * TAKER_FEE
    pnl: float | None = None

    from risk_manager import load_user_risk_state_db, save_user_risk_state_db
    risk_state = await load_user_risk_state_db(current_user_email)
    risk_result = default_risk_manager.check(
        symbol=req.symbol,
        action=req.action,
        quantity=req.quantity,
        price=req.price,
        balance=balance,
        positions=positions,
        state=risk_state,
    )
    if not risk_result.allowed:
        raise HTTPException(status_code=400, detail=f"Risk check failed: {risk_result.reason}")

    # Use potentially-adjusted quantity (position was capped)
    quantity = risk_result.adjusted_quantity if risk_result.adjusted_quantity else req.quantity
    fee = req.price * quantity * TAKER_FEE

    if req.action == "buy":
        cost = req.price * quantity + fee
        if balance < cost:
            raise HTTPException(status_code=400, detail=f"Insufficient balance: need {cost:.2f}, have {balance:.2f}")
        balance -= cost
        pos = positions.get(req.symbol, {"quantity": 0.0, "avg_price": 0.0})
        new_qty = pos["quantity"] + quantity
        new_avg = ((pos["quantity"] * pos["avg_price"]) + (quantity * req.price)) / new_qty
        positions[req.symbol] = {"quantity": round(new_qty, 8), "avg_price": round(new_avg, 4)}

    elif req.action == "sell":
        pos = positions.get(req.symbol)
        if not pos or pos["quantity"] < quantity - 1e-9:
            raise HTTPException(status_code=400, detail=f"Insufficient position: need {quantity}, have {pos['quantity'] if pos else 0}")
        revenue = req.price * quantity - fee
        pnl = round((req.price - pos["avg_price"]) * quantity - fee, 4)
        balance += revenue
        remaining = round(pos["quantity"] - quantity, 8)
        if remaining <= 1e-9:
            del positions[req.symbol]
        else:
            positions[req.symbol]["quantity"] = remaining


    col_users = get_database()["users"]
    await col_users.update_one(
        {"email": current_user_email},
        {"$set": {"paper_balance": round(balance, 4), "paper_positions": positions}}
    )

    # Update risk state after trade & persist to DB
    default_risk_manager.update_after_trade(risk_state, pnl, round(balance, 4), positions)
    await save_user_risk_state_db(current_user_email, risk_state)

    trade_record = {
        "email": current_user_email,
        "symbol": req.symbol,
        "action": req.action,
        "price": req.price,
        "quantity": quantity,
        "fee": round(fee, 4),
        "pnl": pnl,
        "timestamp": datetime.now(timezone.utc)
    }
    col_trades = get_database()["paper_trades"]
    result = await col_trades.insert_one(trade_record)

    return {
        "status": "success",
        "balance": round(balance, 4),
        "positions": positions,
        "pnl": pnl,
        "trade_id": str(result.inserted_id)
    }


@router.get("/portfolio")
async def get_portfolio(current_user_email: str = Depends(get_current_user)):
    """Return current portfolio: balance, positions, unrealised PnL placeholder."""
    if not db.client:
        return {"balance": INITIAL_BALANCE, "positions": {}, "total_equity": INITIAL_BALANCE}

    user = await _get_or_create_portfolio(current_user_email)
    balance = user.get("paper_balance", INITIAL_BALANCE)
    positions = user.get("paper_positions", {})

    return {
        "balance": round(balance, 4),
        "positions": positions,
        # total_equity = cash + sum(qty * avg_price) — rough estimate without live price
        "total_equity": round(balance + sum(p["quantity"] * p["avg_price"] for p in positions.values()), 4),
        "position_count": len(positions)
    }


@router.get("/history")
async def get_trade_history(
    current_user_email: str = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    symbol: str = Query(default=None)
):
    """Paginated trade history, newest first. Optionally filter by symbol."""
    if not db.client:
        return {"trades": [], "total": 0, "page": page, "page_size": page_size}

    col = get_database()["paper_trades"]
    query: dict = {"email": current_user_email}
    if symbol:
        query["symbol"] = symbol.upper()

    total = await col.count_documents(query)
    cursor = col.find(query).sort("timestamp", -1).skip((page - 1) * page_size).limit(page_size)
    trades = [_serialise(t) async for t in cursor]

    return {
        "trades": trades,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size
    }


@router.post("/reset")
async def reset_portfolio(current_user_email: str = Depends(get_current_user)):
    """Reset portfolio to initial $10,000. Deletes all paper trade history."""
    if not db.client:
        return {"status": "success", "balance": INITIAL_BALANCE, "mock": True}

    col_users = get_database()["users"]
    col_trades = get_database()["paper_trades"]

    await col_users.update_one(
        {"email": current_user_email},
        {"$set": {"paper_balance": INITIAL_BALANCE, "paper_positions": {}}}
    )
    deleted = await col_trades.delete_many({"email": current_user_email})

    return {
        "status": "success",
        "balance": INITIAL_BALANCE,
        "positions": {},
        "deleted_trades": deleted.deleted_count
    }


@router.get("/risk-status")
async def get_risk_status(current_user_email: str = Depends(get_current_user)):
    """Returns current risk manager state for the user (consecutive losses, drawdown, halt status)."""
    state = get_user_risk_state(current_user_email)
    cfg = default_risk_manager.config
    return {
        "trading_halted": state.trading_halted,
        "halt_reason": state.halt_reason,
        "consecutive_losses": state.consecutive_losses,
        "max_consecutive_losses": cfg.max_consecutive_losses,
        "daily_pnl": round(state.daily_pnl, 4),
        "daily_loss_limit_pct": cfg.daily_loss_limit_pct,
        "peak_equity": round(state.peak_equity, 4),
        "max_drawdown_pct": cfg.max_drawdown_pct,
        "signal_cooldown_seconds": cfg.signal_cooldown_seconds,
    }
