from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from contextlib import asynccontextmanager

from database import connect_to_mongo, close_mongo_connection, db
from binance_api import get_historical_klines
from kronos_onnx import KronosInference
from agents import TechnicalAgent, SentimentAgent, TraderAgent

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(title="LDM AI Trading Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
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
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                pass

manager = ConnectionManager()
kronos_model = KronosInference()
tech_agent = TechnicalAgent()
sentiment_agent = SentimentAgent()
trader_agent = TraderAgent()

@app.get("/")
async def root():
    return {"message": "LDM AI Trading Backend is running"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def ai_trading_loop():
    symbol = "BTCUSDT"
    while True:
        try:
            # 1. Fetch market data
            await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": "Fetching latest market data..."}))
            history_data = await get_historical_klines(symbol=symbol, interval="1m", limit=512)
            
            # 2. Run Kronos
            await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "System", "thought": "Running Kronos Inference..."}))
            kronos_prediction = kronos_model.predict(history_data)
            await manager.broadcast(json.dumps({
                "type": "ai_log", 
                "agent_name": "Kronos", 
                "thought": f"Trend: {kronos_prediction.get('trend')} (Confidence: {kronos_prediction.get('confidence')}%)"
            }))

            # 3. Agents analysis (concurrently)
            current_price = history_data[-1][3] # Close price of the last candle
            
            tech_task = asyncio.create_task(tech_agent.analyze(kronos_prediction, current_price))
            sent_task = asyncio.create_task(sentiment_agent.analyze(symbol))
            
            tech_analysis, sent_analysis = await asyncio.gather(tech_task, sent_task)
            
            await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Tech Agent", "thought": "Technical analysis completed."}))
            await manager.broadcast(json.dumps({"type": "ai_log", "agent_name": "Sentiment Agent", "thought": "Sentiment analysis completed."}))

            # 4. Final Decision
            decision = await trader_agent.decide(tech_analysis, sent_analysis)
            
            await manager.broadcast(json.dumps({
                "type": "ai_log", 
                "agent_name": "Trader Agent", 
                "thought": f"Decision: {decision['action']}. {decision['reason']}"
            }))
            
            # Store in DB (if DB is connected)
            if db.client:
                collection = db.client.get_database("ldm_trading_db")["trade_signals"]
                await collection.insert_one({
                    "symbol": symbol,
                    "action": decision['action'],
                    "confidence": decision['confidence'],
                    "price": float(current_price),
                    "reason": decision['reason']
                })
                
            # Wait for next cycle (e.g. 5 minutes)
            await asyncio.sleep(300)
            
        except Exception as e:
            print(f"Loop error: {e}")
            await asyncio.sleep(60) # Wait before retry on error

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(ai_trading_loop())
