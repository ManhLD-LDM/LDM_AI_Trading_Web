import xgboost as xgb
import joblib
import asyncio
import os
import sys

# Thêm đường dẫn tới backend để import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trainers.data_utils import fetch_train_data, create_sequences

async def train():
    ohlcv, _ = await fetch_train_data(limit=1000)
    X, y = create_sequences(ohlcv, seq_length=50) # XGBoost dùng 50 nến cho nhẹ
    X_flat = X.reshape(X.shape[0], -1) # Flatten cho XGBoost
    
    model = xgb.XGBClassifier(n_estimators=100, max_depth=3, learning_rate=0.1)
    model.fit(X_flat, y)
    
    save_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "xgboost.pkl")
    joblib.dump(model, save_path)
    print(f"XGBoost trained and saved to {save_path}")

if __name__ == "__main__":
    asyncio.run(train())
