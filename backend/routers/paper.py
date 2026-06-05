from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from database import get_database, db
from datetime import datetime, timezone

router = APIRouter()

class PaperTradeRequest(BaseModel):
    symbol: str
    action: str
    price: float
    quantity: float

@router.post("/execute")
async def execute_paper_trade(req: PaperTradeRequest, current_user_email: str = Depends(get_current_user)):
    if not db.client:
        return {"status": "success", "message": "Simulated (No DB)"}
        
    collection = get_database()["paper_trades"]
    user_state_col = get_database()["users"]
    
    # Simple logic with persistence
    user = await user_state_col.find_one({"email": current_user_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    balance = user.get("paper_balance", 10000.0)
    positions = user.get("paper_positions", {})
    
    fee = req.price * req.quantity * 0.001
    
    if req.action == "buy":
        cost = req.price * req.quantity + fee
        if balance < cost:
            raise HTTPException(status_code=400, detail="Insufficient balance")
            
        balance -= cost
        pos = positions.get(req.symbol, {"quantity": 0, "avg_price": 0})
        
        new_qty = pos["quantity"] + req.quantity
        new_avg = ((pos["quantity"] * pos["avg_price"]) + (req.quantity * req.price)) / new_qty
        positions[req.symbol] = {"quantity": new_qty, "avg_price": new_avg}
        pnl = None
        
    elif req.action == "sell":
        pos = positions.get(req.symbol)
        if not pos or pos["quantity"] < req.quantity:
            raise HTTPException(status_code=400, detail="Insufficient position")
            
        revenue = req.price * req.quantity - fee
        balance += revenue
        pnl = (req.price - pos["avg_price"]) * req.quantity - fee
        
        positions[req.symbol]["quantity"] -= req.quantity
        if positions[req.symbol]["quantity"] <= 0:
            del positions[req.symbol]
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    # Update DB
    await user_state_col.update_one(
        {"email": current_user_email},
        {"$set": {"paper_balance": balance, "paper_positions": positions}}
    )
    
    trade_record = {
        "email": current_user_email,
        "symbol": req.symbol,
        "action": req.action,
        "price": req.price,
        "quantity": req.quantity,
        "pnl": pnl,
        "timestamp": datetime.now(timezone.utc)
    }
    await collection.insert_one(trade_record)
    
    return {"status": "success", "balance": balance, "positions": positions, "trade": trade_record}
