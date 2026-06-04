from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import time
import os
from datetime import datetime, timezone
from pydantic import BaseModel
from contextlib import asynccontextmanager

from database import connect_to_mongo, close_mongo_connection, db, get_database
from binance_api import get_historical_klines
from kronos_onnx import ModelEnsemble
from agents import TechnicalAgent, SentimentAgent, TraderAgent
from auth import (
    UserCreate, UserInDB, Token,
    verify_password, get_password_hash, create_access_token, get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES, timedelta
)
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(title="LDM AI Trading Backend", lifespan=lifespan)

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
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
    return {"status": "ok"}

@app.post("/api/auth/register", response_model=Token)
async def register(user: UserCreate):
    if not db.client:
        raise HTTPException(status_code=503, detail="Database not available (Mock mode)")
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
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if not db.client:
        raise HTTPException(status_code=503, detail="Database not available (Mock mode)")
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

@app.put("/api/user/preferences")
async def update_preferences(preferences: dict, current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"status": "success", "preferences": preferences, "mock": True}
    collection = get_database()["users"]
    await collection.update_one(
        {"email": current_user_email},
        {"$set": {"preferences": preferences}}
    )
    return {"status": "success", "preferences": preferences}

class WebhookSignal(BaseModel):
    bot_name: str
    symbol: str
    action: str
    price: float
    reason: str
    confidence: int = 100

@app.post("/api/webhook/signals")
async def receive_webhook_signal(signal: WebhookSignal):
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
async def get_drawings(symbol: str, current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"data": []}
    collection = get_database()["drawings"]
    doc = await collection.find_one({"email": current_user_email, "symbol": symbol})
    if doc and "data" in doc:
        return {"data": doc["data"]}
    return {"data": []}

@app.post("/api/drawings/{symbol}")
async def save_drawings(symbol: str, drawing: DrawingData, current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"status": "success", "mock": True}
    collection = get_database()["drawings"]
    await collection.update_one(
        {"email": current_user_email, "symbol": symbol},
        {"$set": {"data": drawing.data}},
        upsert=True
    )
    return {"status": "success"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

class AnalysisRequest(BaseModel):
    symbol: str
    interval: str
    model_type: str = "lstm"

@app.post("/api/analysis/run")
async def trigger_analysis(req: AnalysisRequest):
    # Đẩy tác vụ chạy nền (async) để không block giao diện
    asyncio.create_task(run_analysis_for_symbol(req.symbol, req.interval, req.model_type))
    return {"status": "success", "message": f"Started analysis for {req.symbol} on {req.interval} using {req.model_type}."}

async def run_analysis_for_symbol(symbol: str, interval: str, model_type: str = "lstm"):
    try:
        # 1. Fetch market data
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": f"[{symbol}] Fetching latest market data for {interval}..."}))
        history_data = await get_historical_klines(symbol=symbol, interval=interval, limit=512)
        
        # 2. Run Model Ensemble
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": f"[{symbol}] Running {model_type.upper()} Inference..."}))
        kronos_prediction = ensemble_model.predict(history_data, model_type)
        await manager.broadcast(json.dumps({
            "type": "ai_log", 
            "agent_name": "Kronos", 
            "thought": f"[{symbol}] Trend: {kronos_prediction.get('trend')} (Confidence: {kronos_prediction.get('confidence')}%)"
        }))

        # 3. Agents analysis (concurrently)
        recent_candles = history_data[-50:] if len(history_data) >= 50 else history_data
        current_price = history_data[-1][4] # Close price of the last candle
        
        tech_task = asyncio.create_task(tech_agent.analyze(kronos_prediction, recent_candles, interval))
        sent_task = asyncio.create_task(sentiment_agent.analyze(symbol))
        
        tech_analysis, sent_analysis = await asyncio.gather(tech_task, sent_task)
        
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Tech Agent", "thought": f"[{symbol}] Technical analysis completed."}))
        await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Sentiment Agent", "thought": f"[{symbol}] Sentiment analysis completed."}))

        # 4. Final Decision
        decision = await trader_agent.decide(tech_analysis, sent_analysis, interval)
        
        await manager.broadcast(json.dumps({
            "type": "ai_log", 
            "agent_name": "Trader Agent", 
            "thought": f"[{symbol}] Decision: {decision.get('action')}. {decision.get('reason')}",
            "action": decision.get('action'),
            "price": float(current_price),
            "timestamp": int(history_data[-1][0] / 1000)
        }))
        
        # Store in DB (if DB is connected)
        if db.client:
            collection = get_database()["trade_signals"]
            await collection.insert_one({
                "symbol": symbol,
                "action": decision.get('action'),
                "confidence": decision.get('confidence'),
                "price": float(current_price),
                "reason": decision.get('reason'),
                "createdAt": datetime.now(timezone.utc)
            })
    except Exception as e:
        print(f"[{symbol}] Analysis error: {e}")
