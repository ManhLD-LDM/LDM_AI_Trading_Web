from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json

class TradeExecution(BaseModel):
    symbol: str
    action: str
    price: float
    quantity: float
    timestamp: datetime
    pnl: Optional[float] = None

class PaperTradingEngine:
    def __init__(self):
        self.positions = {}
        self.history = []
        self.balance = 10000.0
        
    def execute_trade(self, symbol: str, action: str, price: float, quantity: float):
        fee = price * quantity * 0.001
        
        if action == "buy":
            cost = price * quantity + fee
            if self.balance >= cost:
                self.balance -= cost
                if symbol not in self.positions:
                    self.positions[symbol] = {"quantity": 0, "avg_price": 0}
                
                prev_qty = self.positions[symbol]["quantity"]
                prev_avg = self.positions[symbol]["avg_price"]
                new_qty = prev_qty + quantity
                new_avg = ((prev_qty * prev_avg) + (quantity * price)) / new_qty
                
                self.positions[symbol] = {"quantity": new_qty, "avg_price": new_avg}
                
                trade = TradeExecution(symbol=symbol, action=action, price=price, quantity=quantity, timestamp=datetime.utcnow())
                self.history.append(trade)
                return True, trade
            else:
                return False, "Insufficient balance"
                
        elif action == "sell":
            if symbol in self.positions and self.positions[symbol]["quantity"] >= quantity:
                revenue = price * quantity - fee
                self.balance += revenue
                
                avg_price = self.positions[symbol]["avg_price"]
                pnl = (price - avg_price) * quantity - fee
                
                self.positions[symbol]["quantity"] -= quantity
                if self.positions[symbol]["quantity"] == 0:
                    del self.positions[symbol]
                    
                trade = TradeExecution(symbol=symbol, action=action, price=price, quantity=quantity, timestamp=datetime.utcnow(), pnl=pnl)
                self.history.append(trade)
                return True, trade
            else:
                return False, "Insufficient position"
        
        return False, "Invalid action"

# Global instance for demo
paper_engine = PaperTradingEngine()
