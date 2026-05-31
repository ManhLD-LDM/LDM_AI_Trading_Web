from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class TradeSignal(BaseModel):
    symbol: str
    action: str = Field(..., description="BUY or SELL")
    confidence: float
    price: float
    reason: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class AILog(BaseModel):
    agent_name: str
    thought: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class BotConfig(BaseModel):
    symbol: str = "BTCUSDT"
    timeframe: str = "1m"
    discord_webhook: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
