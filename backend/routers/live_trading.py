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
        raise HTTPException(
            503,
            "Database unavailable. Binance API keys cannot be loaded. "
            "Check MongoDB Atlas connection."
        )

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
    if not is_connected():
        return {"balances": {}, "usdt_free": 0.0, "testnet": testnet, "db_unavailable": True}
    executor = await _get_executor(current_user_email, testnet)
    balances = await executor.get_account_balance()
    usdt = balances.get("USDT", {}).get("free", 0.0)
    return {
        "balances": balances,
        "usdt_free": usdt,
        "testnet": testnet,
        "db_unavailable": False,
    }


@router.get("/orders/open")
async def get_open_orders(
    symbol: str | None = None,
    testnet: bool = True,
    current_user_email: str = Depends(get_current_user)
):
    """Lấy danh sách open orders, optional filter theo symbol."""
    if not is_connected():
        return {"orders": [], "count": 0, "db_unavailable": True}
    executor = await _get_executor(current_user_email, testnet)
    orders = await executor.get_open_orders(symbol=symbol.upper() if symbol else None)
    return {"orders": orders, "count": len(orders), "db_unavailable": False}


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


@router.get("/ai-consult")
async def get_ai_consultation(
    symbol: str = "BTCUSDT",
    interval: str = "1m",
    mode: str = "scalp",
    current_user_email: str = Depends(get_current_user)
):
    """
    Tạo Kế hoạch Cố vấn Trading AI Đa Khung Thời Gian (Multi-Timeframe AI Trading Blueprint)
    Phân tích hợp lưu từ khung 15m, 1h, 4h, 1D, 1W cho khung thời gian người dùng đang xem.
    Chế độ: scalp (lướt sóng ngắn) hoặc swing (đánh xu hướng dài).
    """
    sym = symbol.upper().strip()
    if not VALID_SYMBOL_RE.match(sym):
        raise HTTPException(400, "Invalid symbol format")

    try:
        from binance_api import get_mtf_klines, get_historical_klines
        mtf_klines = await get_mtf_klines(sym, ['15m', '1h', '4h', '1d', '1w'], limit=100)
        
        # Primary candles for current view
        candles = mtf_klines.get(interval)
        if not candles:
            candles = await get_historical_klines(sym, interval, limit=100)
        if hasattr(candles, 'tolist'):
            candles = candles.tolist()
        
        if candles is None or len(candles) < 5:
            raise HTTPException(400, f"Insufficient candle data for {sym}")
        
        current_price = float(candles[-1][4])

        from agents import TechnicalAgent, SentimentAgent, TraderAgent

        # 1. Kronos Prediction (or default mock trend)
        try:
            from kronos_onnx import ModelEnsemble
            kronos = ModelEnsemble()
            kronos_pred = kronos.predict(candles, model_type="lstm")
        except Exception:
            kronos_pred = {"trend": "UP", "confidence": 80}

        # 2. Multi-Timeframe Technical Agent Analysis (15m, 1h, 4h, 1D, 1W)
        tech_agent = TechnicalAgent()
        tech_analysis = await tech_agent.analyze_mtf(kronos_pred, mtf_klines, interval)

        # 3. Sentiment Agent Analysis
        sent_agent = SentimentAgent()
        sentiment_analysis = await sent_agent.analyze(sym)

        # 4. Trader Agent Consultation Blueprint (with Scalp/Swing Mode)
        trader_agent = TraderAgent()
        consultation_plan = await trader_agent.consult(
            symbol=sym,
            interval=interval,
            mode=mode,
            current_price=current_price,
            candles=candles,
            kronos_prediction=kronos_pred,
            tech_analysis=tech_analysis,
            sentiment_analysis=sentiment_analysis,
        )

        # Persist consultation plan to MongoDB for user history retention
        if is_connected():
            db = get_database()
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            doc_id = f"plan_{now_ms}_{sym}_{interval}"
            doc = {
                "id": doc_id,
                "email": current_user_email,
                "timestamp": now_ms,
                "created_at": datetime.now(timezone.utc),
                **consultation_plan,
            }
            await db["ai_consultations"].insert_one(doc)

            # Auto-prune old plans if count exceeds 100 per user to conserve MongoDB Cloud Free Tier storage
            user_doc_count = await db["ai_consultations"].count_documents({"email": current_user_email})
            if user_doc_count > 100:
                oldest_docs = await db["ai_consultations"].find(
                    {"email": current_user_email},
                    sort=[("created_at", 1)],
                    limit=user_doc_count - 100
                ).to_list(user_doc_count - 100)
                oldest_ids = [d["_id"] for d in oldest_docs]
                if oldest_ids:
                    await db["ai_consultations"].delete_many({"_id": {"$in": oldest_ids}})

        return consultation_plan
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"[AI CONSULT] Error generating plan for {sym}: {e}")
        raise HTTPException(500, f"AI Consultation failed: {str(e)}")


async def evaluate_plan_historical_klines(doc: dict) -> dict:
    """
    Tự động truy vấn 100 nến Binance 15m để backfill & kiểm tra xem giá đã từng chạm Entry, TP1, TP2 hay SL chưa.
    Đảm bảo lệnh KHÔNG BAO GIỜ bị quay về trạng thái PENDING nếu giá đã từng chạm Entry trong quá khứ.
    """
    current_status = doc.get("status", "PENDING")
    if current_status in ["WIN_100", "WIN_BE", "LOSS"]:
        return doc

    sym = doc.get("symbol", "BTCUSDT").upper().replace("/", "")
    inv = doc.get("interval", "15m")
    is_long = doc.get("recommendation") == "LONG"
    
    entry_zone = doc.get("entryZone", {})
    ideal_entry = float(entry_zone.get("idealEntry", 0))
    min_entry = float(entry_zone.get("minPrice", ideal_entry))
    max_entry = float(entry_zone.get("maxPrice", ideal_entry))
    sl = float(doc.get("stopLoss", {}).get("price", 0))
    
    take_profit = doc.get("takeProfit", [])
    tp1 = float(take_profit[0].get("price", 0)) if len(take_profit) > 0 else (ideal_entry * 1.015 if is_long else ideal_entry * 0.985)
    tp2 = float(take_profit[1].get("price", 0)) if len(take_profit) > 1 else (ideal_entry * 1.03 if is_long else ideal_entry * 0.97)

    if not ideal_entry:
        return doc

    try:
        from binance_api import get_historical_klines
        klines = await get_historical_klines(sym, inv, limit=100)
        if not klines or len(klines) == 0:
            return doc

        entry_min = min(min_entry, max_entry) * 0.998
        entry_max = max(min_entry, max_entry) * 1.002

        next_status = current_status
        activated_at = doc.get("activatedAt")
        completed_at = doc.get("completedAt")
        current_sl = doc.get("currentSlPrice", sl)

        # Get position creation timestamp (or re-analysis timestamp) in milliseconds
        plan_creation_ms = doc.get("timestamp")
        if not plan_creation_ms and doc.get("created_at"):
            ca = doc["created_at"]
            if isinstance(ca, datetime):
                plan_creation_ms = int(ca.timestamp() * 1000)
            elif isinstance(ca, str):
                try:
                    plan_creation_ms = int(datetime.fromisoformat(ca.replace("Z", "+00:00")).timestamp() * 1000)
                except Exception:
                    plan_creation_ms = 0

        # Allow 15m candle buffer (the 15m candle in which position was created)
        min_allowed_time = (plan_creation_ms or 0) - (15 * 60 * 1000)

        for k in klines:
            candle_open_time = int(k[0])
            
            # RULE: IGNORE ALL CANDLES BEFORE POSITION CREATION TIMESTAMP!
            if min_allowed_time > 0 and candle_open_time < min_allowed_time:
                continue

            high = float(k[2])
            low = float(k[3])

            if next_status == "PENDING":
                if is_long:
                    if high >= entry_min:
                        next_status = "ACTIVE"
                        activated_at = activated_at or int(k[0])
                else:
                    if low <= entry_max:
                        next_status = "ACTIVE"
                        activated_at = activated_at or int(k[0])

            if next_status == "ACTIVE":
                if is_long:
                    if high >= tp1:
                        next_status = "PARTIAL_TP1"
                        current_sl = ideal_entry
                    elif low <= sl:
                        next_status = "LOSS"
                        completed_at = int(k[0])
                else:
                    if low <= tp1:
                        next_status = "PARTIAL_TP1"
                        current_sl = ideal_entry
                    elif high >= sl:
                        next_status = "LOSS"
                        completed_at = int(k[0])

            if next_status == "PARTIAL_TP1":
                if is_long:
                    if high >= tp2:
                        next_status = "WIN_100"
                        completed_at = int(k[0])
                    elif low <= ideal_entry:
                        next_status = "WIN_BE"
                        completed_at = int(k[0])
                else:
                    if low <= tp2:
                        next_status = "WIN_100"
                        completed_at = int(k[0])
                    elif high >= ideal_entry:
                        next_status = "WIN_BE"
                        completed_at = int(k[0])

        if next_status != current_status:
            doc["status"] = next_status
            if activated_at: doc["activatedAt"] = activated_at
            if completed_at: doc["completedAt"] = completed_at
            doc["currentSlPrice"] = current_sl

            if is_connected():
                db = get_database()
                update_fields = {
                    "status": next_status,
                    "activatedAt": activated_at,
                    "completedAt": completed_at,
                    "currentSlPrice": current_sl,
                    "updated_at": datetime.now(timezone.utc)
                }
                
                if next_status in ["WIN_100", "WIN_BE", "PARTIAL_TP1", "LOSS"] and "postMortemAnalysis" not in doc:
                    try:
                        from agents import StrategyLearnerAgent
                        learner = StrategyLearnerAgent()
                        post_m = await learner.analyze_outcome(doc, next_status)
                        doc["postMortemAnalysis"] = post_m
                        update_fields["postMortemAnalysis"] = post_m
                    except Exception as e:
                        logger.warning(f"Auto post-mortem error: {e}")

                await db["ai_consultations"].update_one(
                    {"id": doc["id"]},
                    {"$set": update_fields}
                )

    except Exception as e:
        logger.warning(f"Error evaluating plan historical klines: {e}")

    return doc


@router.get("/ai-consult/history")
async def get_ai_consultation_history(
    limit: int = 50,
    current_user_email: str = Depends(get_current_user)
):
    """Lấy lịch sử Kế hoạch Cố vấn AI của người dùng từ MongoDB với tự động backfill kết quả từ nến Binance."""
    if not is_connected():
        return {"history": []}

    db = get_database()
    cursor = db["ai_consultations"].find(
        {"email": current_user_email},
        sort=[("created_at", -1)],
        limit=min(limit, 100),
    )
    docs = await cursor.to_list(min(limit, 100))
    evaluated_docs = []
    for d in docs:
        if "_id" in d:
            d["id"] = d.get("id") or str(d["_id"])
            d.pop("_id", None)
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()
        
        # Backfill & evaluate historical klines for each plan
        evaluated = await evaluate_plan_historical_klines(d)
        evaluated_docs.append(evaluated)

    return {"history": evaluated_docs, "count": len(evaluated_docs)}


@router.put("/ai-consult/status")
async def update_ai_consultation_status(
    data: dict,
    current_user_email: str = Depends(get_current_user)
):
    """Cập nhật trạng thái lệnh AI (PENDING, ACTIVE, PARTIAL_TP1, WIN_100, WIN_BE, LOSS) và tự động phân tích học chiến lược."""
    if not is_connected():
        return {"status": "ok"}

    plan_id = data.get("id")
    status = data.get("status")
    if not plan_id or not status:
        raise HTTPException(400, "Missing plan id or status")

    db = get_database()
    doc = await db["ai_consultations"].find_one({"email": current_user_email, "id": plan_id})
    if not doc:
        return {"status": "not_found"}

    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc),
    }
    if data.get("activatedAt"):
        update_data["activatedAt"] = data["activatedAt"]
    if data.get("completedAt"):
        update_data["completedAt"] = data["completedAt"]
    if data.get("currentSlPrice"):
        update_data["currentSlPrice"] = data["currentSlPrice"]

    # Trigger AI Strategy Learner Post-Mortem if outcome is finished (WIN_100, WIN_BE, PARTIAL_TP1, LOSS)
    if status in ["WIN_100", "WIN_BE", "PARTIAL_TP1", "LOSS"] and "postMortemAnalysis" not in doc:
        try:
            from agents import StrategyLearnerAgent
            learner = StrategyLearnerAgent()
            post_mortem = await learner.analyze_outcome(doc, status)
            update_data["postMortemAnalysis"] = post_mortem
        except Exception as e:
            logger.warning(f"Post-mortem strategy learning failed: {e}")

    await db["ai_consultations"].update_one(
        {"email": current_user_email, "id": plan_id},
        {"$set": update_data}
    )
    return {"status": "updated", "id": plan_id, "new_status": status, "postMortemAnalysis": update_data.get("postMortemAnalysis")}


@router.post("/ai-consult/reanalyze")
async def reanalyze_ai_consultation(
    data: dict,
    current_user_email: str = Depends(get_current_user)
):
    """
    Phân tích lại Kế hoạch AI Cố vấn cho lệnh có trạng thái CHỜ ENTRY (PENDING).
    Không cho phép phân tích lại các lệnh đã chạy, thắng hoặc thua.
    """
    plan_id = data.get("id")
    if not plan_id:
        raise HTTPException(400, "Missing plan id")

    if not is_connected():
        raise HTTPException(400, "Database not connected")

    db = get_database()
    doc = await db["ai_consultations"].find_one({"email": current_user_email, "id": plan_id})
    if not doc:
        raise HTTPException(404, "Order plan not found")

    current_status = doc.get("status", "PENDING")
    if current_status != "PENDING":
        raise HTTPException(400, f"Không thể phân tích lại lệnh có trạng thái {current_status}. Chỉ cho phép lệnh CHỜ ENTRY.")

    sym = doc.get("symbol", "BTCUSDT")
    interval = doc.get("interval", "15m")
    mode = doc.get("mode", "SCALP")

    try:
        from binance_api import get_mtf_klines, get_historical_klines
        mtf_klines = await get_mtf_klines(sym, ['15m', '1h', '4h', '1d', '1w'], limit=100)
        candles = mtf_klines.get(interval)
        if not candles:
            candles = await get_historical_klines(sym, interval, limit=100)
        if hasattr(candles, 'tolist'):
            candles = candles.tolist()

        current_price = float(candles[-1][4])

        from agents import TechnicalAgent, SentimentAgent, TraderAgent
        try:
            from kronos_onnx import ModelEnsemble
            kronos = ModelEnsemble()
            kronos_pred = kronos.predict(candles, model_type="lstm")
        except Exception:
            kronos_pred = {"trend": "UP", "confidence": 80}

        tech_agent = TechnicalAgent()
        tech_analysis = await tech_agent.analyze_mtf(kronos_pred, mtf_klines, interval)

        sent_agent = SentimentAgent()
        sentiment_analysis = await sent_agent.analyze(sym)

        # 1. Pre-Reanalysis Audit: Evaluate risk & TP/SL feasibility of existing plan FIRST
        from agents import PendingAuditAgent, TraderAgent
        audit_agent = PendingAuditAgent()
        pending_audit = await audit_agent.audit_pending_plan(
            existing_plan=doc,
            current_price=current_price,
            tech_analysis=tech_analysis,
            sentiment_analysis=sentiment_analysis
        )

        # 2. Trader Agent: Recalculate optimal entry, SL, TP parameters
        trader_agent = TraderAgent()
        new_plan = await trader_agent.consult(
            symbol=sym,
            interval=interval,
            mode=mode,
            current_price=current_price,
            candles=candles,
            kronos_prediction=kronos_pred,
            tech_analysis=tech_analysis,
            sentiment_analysis=sentiment_analysis,
        )

        now_time = datetime.now(timezone.utc)
        now_ms = int(now_time.timestamp() * 1000)

        update_fields = {
            "timestamp": now_ms,
            "entryZone": new_plan.get("entryZone"),
            "stopLoss": new_plan.get("stopLoss"),
            "takeProfit": new_plan.get("takeProfit"),
            "confidence": new_plan.get("confidence"),
            "riskRewardRatio": new_plan.get("riskRewardRatio"),
            "analysisSummary": new_plan.get("analysisSummary"),
            "pendingAudit": pending_audit,
            "reanalyzedAt": now_time,
        }

        await db["ai_consultations"].update_one(
            {"email": current_user_email, "id": plan_id},
            {"$set": update_fields}
        )

        updated_doc = {**doc, **update_fields}
        updated_doc.pop("_id", None)
        return updated_doc
    except Exception as e:
        logger.error(f"[REANALYZE] Error for {sym}: {e}")
        raise HTTPException(500, f"Re-analysis failed: {str(e)}")


