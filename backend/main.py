from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time
import os
import re
from datetime import datetime, timezone
from pydantic import BaseModel, field_validator, Field
from contextlib import asynccontextmanager
from logger import main_logger
from alert_manager import alert_manager

from database import connect_to_mongo, close_mongo_connection, db, get_database, is_connected
from binance_api import get_historical_klines, get_mtf_klines
from kronos_onnx import ModelEnsemble
from agents import TechnicalAgent, SentimentAgent, TraderAgent
from auth import (
    UserCreate, UserInDB, Token,
    verify_password, get_password_hash, create_access_token, get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES, timedelta
)

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request, Security
from fastapi.security import APIKeyHeader

from routers import backtest, paper, live_trading

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    
    # Start analysis workers
    workers = []
    for _ in range(WORKER_COUNT):
        workers.append(asyncio.create_task(analysis_worker()))
        
    yield
    
    # Shutdown workers
    for w in workers:
        w.cancel()
    await close_mongo_connection()

app = FastAPI(title="LDM AI Trading Backend", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# IMPORTANT: SlowAPI middleware is added AFTER CORS so OPTIONS preflights
# are handled by CORS before rate-limit checks run.
app.include_router(backtest.router, prefix="/api/backtest", tags=["Backtest"])
app.include_router(paper.router, prefix="/api/paper", tags=["Paper Trading"])
app.include_router(live_trading.router, prefix="/api/live", tags=["Live Trading"])

# Validation constants
VALID_SYMBOL_RE = re.compile(r'^[A-Z]{2,20}$')
VALID_INTERVALS = {'1s','1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M'}
VALID_MODELS = {'lstm', 'xgboost', 'transformer', 'tcn'}

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
environment = os.getenv("ENVIRONMENT", "development").lower()

# In development: allow all origins so local/LAN testing works without CORS issues.
# In production: strictly whitelist ALLOWED_ORIGINS only.
if environment == "development":
    # allow_origin_regex=".*" allows any origin AND supports credentials (JWT headers).
    # allow_origins=["*"] would block credentials — cannot be used together.
    cors_kwargs = dict(
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    cors_kwargs = dict(
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CORSMiddleware, **cors_kwargs)

# Log active CORS config on startup
import logging as _logging
_logging.getLogger("ldm.cors").info(
    f"CORS mode={'OPEN (dev)' if environment == 'development' else f'STRICT ({len(origins)} origins)'}"
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead_connections.append(connection)
        
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()
ensemble_model = ModelEnsemble()
tech_agent = TechnicalAgent()
sentiment_agent = SentimentAgent()
trader_agent = TraderAgent()

@app.get("/")
async def root():
    return {"message": "LDM AI Trading Backend is running"}

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "database": "connected" if is_connected() else "mock_mode",
        "models": list(ensemble_model.models.keys()) or ["none_loaded"],
    }

@app.post("/api/auth/register", response_model=Token)
@limiter.limit("3/minute")
async def register(request: Request, user: UserCreate):
    if not is_connected():
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Check MongoDB Atlas: cluster may be paused or IP not whitelisted."
        )
    collection = get_database()["users"]
    existing_user = await collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = {
        "email": user.email,
        "hashed_password": hashed_password,
        "preferences": {}
    }
    await collection.insert_one(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=Token)
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    if not is_connected():
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Check MongoDB Atlas: cluster may be paused or IP not whitelisted."
        )
    collection = get_database()["users"]
    user = await collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/user/me")
async def read_users_me(current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"email": current_user_email, "preferences": {}}
    collection = get_database()["users"]
    user = await collection.find_one({"email": current_user_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"email": user["email"], "preferences": user.get("preferences", {})}

class UserPreferences(BaseModel):
    """
    Accept any fields the frontend sends — pair, interval, indicators,
    settings (risk params, API keys), etc. Stored as-is in MongoDB.
    """
    model_config = {"extra": "allow"}

@app.put("/api/user/preferences")
async def update_preferences(preferences: UserPreferences, current_user_email: str = Depends(get_current_user)):
    prefs_dict = preferences.model_dump()
    if not db.client:
        return {"status": "success", "preferences": prefs_dict, "mock": True}
    collection = get_database()["users"]
    # Use $set with dot-notation merge so we don't overwrite unrelated prefs
    update_fields = {f"preferences.{k}": v for k, v in prefs_dict.items()}
    await collection.update_one(
        {"email": current_user_email},
        {"$set": update_fields}
    )
    return {"status": "success", "preferences": prefs_dict}

class WebhookSignal(BaseModel):
    bot_name: str
    symbol: str
    action: str
    price: float
    reason: str
    confidence: int = 100

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

@app.post("/api/webhook/signals")
async def receive_webhook_signal(signal: WebhookSignal, api_key: str = Security(api_key_header)):
    expected_key = os.getenv("WEBHOOK_API_KEY")
    if not expected_key or api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid or missing API Key")
    # Broadcast to frontend
    await manager.broadcast(json.dumps({
        "type": "ai_log",
        "agent_name": f"Webhook Bot ({signal.bot_name})",
        "thought": f"Decision: {signal.action}. {signal.reason}",
        "action": signal.action,
        "price": signal.price,
        "timestamp": int(time.time())
    }))
    
    # Store in DB
    if db.client:
        collection = get_database()["trade_signals"]
        await collection.insert_one({
            "bot_name": signal.bot_name,
            "symbol": signal.symbol,
            "action": signal.action,
            "confidence": signal.confidence,
            "price": signal.price,
            "reason": signal.reason,
            "source": "webhook",
            "createdAt": datetime.now(timezone.utc)
        })
    return {"status": "success", "message": "Signal processed"}

class DrawingData(BaseModel):
    data: list

@app.get("/api/drawings/{symbol}")
async def get_drawings(symbol: str, interval: str = "1m", current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"data": []}
    collection = get_database()["drawings"]
    doc = await collection.find_one({"email": current_user_email, "symbol": symbol, "interval": interval})
    if doc and "data" in doc:
        return {"data": doc["data"]}
    return {"data": []}

@app.post("/api/drawings/{symbol}")
async def save_drawings(symbol: str, drawing: DrawingData, interval: str = "1m", current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"status": "success", "mock": True}
    collection = get_database()["drawings"]
    await collection.update_one(
        {"email": current_user_email, "symbol": symbol, "interval": interval},
        {"$set": {"data": drawing.data}},
        upsert=True
    )
    return {"status": "success"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Auth flow:
    1. Client connects
    2. Client sends {"type":"auth","token":"<JWT>"} within 10s
    3. If valid → joined to broadcast group
    4. Client should send {"type":"ping"} every 30s to keep alive
    """
    await websocket.accept()

    # Step 1: Wait for auth message
    try:
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Auth timeout (10s)")
        return
    except Exception:
        await websocket.close(code=1008, reason="Bad auth message")
        return

    if auth_data.get("type") != "auth":
        await websocket.close(code=1008, reason="Expected auth message first")
        return

    # Step 2: Validate token
    token = auth_data.get("token", "")
    try:
        from auth import SECRET_KEY, ALGORITHM
        from jose import jwt, JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise JWTError()
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Step 3: Join broadcast group
    await manager.connect(websocket)
    main_logger.info(f"WS connected: {payload.get('sub')}")

    try:
        while True:
            try:
                # Wait for ping/message with a timeout — auto-disconnect stale connections
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=90.0)
                try:
                    msg = json.loads(raw)
                    if msg.get("type") == "ping":
                        await websocket.send_text('{"type":"pong"}')
                except json.JSONDecodeError:
                    pass  # Ignore non-JSON messages
            except asyncio.TimeoutError:
                # No ping received in 90s — send server-side ping
                try:
                    await websocket.send_text('{"type":"ping"}')
                except Exception:
                    break  # Connection dead
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
        main_logger.info(f"WS disconnected: {payload.get('sub')}")


class AnalysisRequest(BaseModel):
    symbol: str = Field(..., min_length=3, max_length=20)
    interval: str = Field(default="1m")
    model_type: str = Field(default="lstm")

    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v: str) -> str:
        v = v.upper().strip()
        if not VALID_SYMBOL_RE.match(v):
            raise ValueError('Symbol must be 3-20 uppercase letters, e.g. BTCUSDT')
        return v

    @field_validator('interval')
    @classmethod
    def validate_interval(cls, v: str) -> str:
        if v not in VALID_INTERVALS:
            raise ValueError(f'interval must be one of: {sorted(VALID_INTERVALS)}')
        return v

    @field_validator('model_type')
    @classmethod
    def validate_model_type(cls, v: str) -> str:
        if v not in VALID_MODELS:
            raise ValueError(f'model_type must be one of: {VALID_MODELS}')
        return v

analysis_queue = asyncio.Queue()
WORKER_COUNT = 5

async def analysis_worker():
    while True:
        try:
            req = await analysis_queue.get()
            symbol, interval, model_type = req
            await run_analysis_with_recovery(symbol, interval, model_type)
        except Exception as e:
            print(f"Worker error: {e}")
        finally:
            analysis_queue.task_done()

@app.post("/api/analysis/run")
@limiter.limit("10/minute")
async def trigger_analysis(request: Request, req: AnalysisRequest, current_user_email: str = Depends(get_current_user)):
    # Đẩy tác vụ vào hàng đợi (Queue)
    await analysis_queue.put((req.symbol, req.interval, req.model_type))
    return {"status": "success", "message": f"Queued analysis for {req.symbol} on {req.interval} using {req.model_type}."}

async def run_analysis_with_recovery(symbol: str, interval: str, model_type: str):
    for attempt in range(3):
        try:
            await run_analysis_for_symbol(symbol, interval, model_type)
            break
        except Exception as e:
            print(f"[{symbol}] Attempt {attempt+1} failed: {e}")
            if attempt == 2:
                await manager.broadcast(json.dumps({
                    "type": "error",
                    "agent_name": "System",
                    "message": f"Analysis failed for {symbol}: {str(e)}"
                }))
            await asyncio.sleep(2 ** attempt)  # Exponential backoff: 1s, 2s, 4s

async def run_analysis_for_symbol(symbol: str, interval: str, model_type: str = "lstm"):
    try:
        # 1. Fetch multi-timeframe market data concurrently
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": f"[{symbol}] Fetching MTF data (5 timeframes)..."}))
        mtf_data = await get_mtf_klines(symbol=symbol)

        # Also fetch single-interval data for agents (candles + price)
        history_data = await get_historical_klines(symbol=symbol, interval=interval, limit=512)

        # 2. Run Model Ensemble (async, non-blocking)
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": f"[{symbol}] Running {model_type.upper()} MTF Inference..."}))
        kronos_prediction = await ensemble_model.predict_async(mtf_data, model_type, symbol, interval)
        await manager.broadcast(json.dumps({
            "type": "ai_log",
            "agent_name": "Kronos",
            "thought": f"[{symbol}] Trend: {kronos_prediction.get('trend')} (Confidence: {kronos_prediction.get('confidence')}%)"
        }))

        # 3. Agents analysis (concurrently)
        recent_candles = history_data[-50:].tolist() if hasattr(history_data, 'tolist') else list(history_data)[-50:]
        current_price = float(history_data[-1][4])

        tech_task = asyncio.create_task(tech_agent.analyze_mtf(kronos_prediction, mtf_data, interval))
        sent_task = asyncio.create_task(sentiment_agent.analyze(symbol))

        tech_analysis, sent_analysis = await asyncio.gather(tech_task, sent_task)

        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Tech Agent", "thought": f"[{symbol}] Multi-Timeframe Technical analysis completed."}))
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Sentiment Agent", "thought": f"[{symbol}] Sentiment analysis completed."}))

        # 4. Final Decision via Trader Agent Consultation
        candles_list = history_data.tolist() if hasattr(history_data, 'tolist') else list(history_data)
        consultation = await trader_agent.consult(
            symbol=symbol,
            interval=interval,
            mode="scalp",
            current_price=current_price,
            candles=candles_list,
            kronos_prediction=kronos_prediction,
            tech_analysis=tech_analysis,
            sentiment_analysis=sent_analysis,
        )

        action = consultation.get("recommendation", "WAIT")
        confidence = consultation.get("confidence", 50)
        reason = consultation.get("analysisSummary", {}).get("technicalConfluence", "AI analysis completed.")

        await manager.broadcast(json.dumps({
            "type": "ai_log",
            "agent_name": "Trader Agent",
            "thought": f"[{symbol}] Recommendation: {action} (Confidence: {confidence}%). {reason}",
            "action": action,
            "price": current_price,
            "timestamp": int(history_data[-1][0] / 1000)
        }))

        # Fire alert for actionable signals
        await alert_manager.send_signal_alert(
            symbol=symbol,
            action=action,
            price=current_price,
            confidence=float(confidence),
            reason=str(reason)[:300],
            model_type=model_type.upper(),
        )

        # Store in DB
        if db.client:
            collection = get_database()["trade_signals"]
            await collection.insert_one({
                "symbol": symbol,
                "action": action,
                "confidence": confidence,
                "price": current_price,
                "reason": reason,
                "consultation_plan": consultation,
                "createdAt": datetime.now(timezone.utc)
            })
    except Exception as e:
        main_logger.error(f"[{symbol}] Analysis error: {e}")
        await alert_manager.send_error_alert(f"Analysis [{symbol}/{interval}]", str(e))


# ─── Binance API Key Management ───────────────────────────────────────────────

class BinanceKeysRequest(BaseModel):
    api_key: str = Field(..., min_length=10, description="Binance API Key")
    api_secret: str = Field(..., min_length=10, description="Binance API Secret")


@app.post("/api/user/binance-keys")
@limiter.limit("5/minute")
async def save_binance_keys(
    request: Request,
    keys: BinanceKeysRequest,
    current_user_email: str = Depends(get_current_user),
):
    """
    Lưu Binance API keys đã được mã hóa vào MongoDB.
    Keys được encrypt bằng Fernet/PBKDF2 trước khi lưu.
    """
    if not is_connected():
        raise HTTPException(503, "Database unavailable")

    from exchange.key_manager import encrypt_key, verify_key_pair

    if not verify_key_pair(keys.api_key, keys.api_secret):
        raise HTTPException(
            400,
            "Invalid Binance key format. Keys must be alphanumeric and at least 40 characters."
        )

    try:
        enc_key = encrypt_key(keys.api_key)
        enc_secret = encrypt_key(keys.api_secret)
    except RuntimeError as e:
        raise HTTPException(500, f"Encryption error: {e}")

    collection = get_database()["users"]
    await collection.update_one(
        {"email": current_user_email},
        {"$set": {
            "binance_api_key": enc_key,
            "binance_api_secret": enc_secret,
            "binance_keys_updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"status": "success", "message": "Binance API keys saved securely (Fernet encrypted)"}


@app.get("/api/user/binance-keys/status")
async def get_binance_keys_status(current_user_email: str = Depends(get_current_user)):
    """Check nếu user đã có Binance API keys (không trả về key thực)."""
    if not is_connected():
        return {"has_keys": False, "mock": True}
    collection = get_database()["users"]
    user = await collection.find_one({"email": current_user_email})
    has_keys = bool(user and user.get("binance_api_key"))
    updated_at = None
    if has_keys and user.get("binance_keys_updated_at"):
        updated_at = user["binance_keys_updated_at"].isoformat()
    return {"has_keys": has_keys, "updated_at": updated_at}


@app.delete("/api/user/binance-keys")
async def delete_binance_keys(current_user_email: str = Depends(get_current_user)):
    """Xóa Binance API keys khỏi DB."""
    if not is_connected():
        raise HTTPException(503, "Database unavailable")
    collection = get_database()["users"]
    await collection.update_one(
        {"email": current_user_email},
        {"$unset": {"binance_api_key": "", "binance_api_secret": "", "binance_keys_updated_at": ""}},
    )
    return {"status": "success", "message": "Binance API keys removed"}
