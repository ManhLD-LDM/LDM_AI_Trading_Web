import numpy as np
import os
import pandas as pd
import pandas_ta as ta

try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    import joblib
except ImportError:
    joblib = None

try:
    import xgboost as xgb
except ImportError:
    xgb = None

class ModelEnsemble:
    CLASS_MAP = {
        'BTCUSDT': 'crypto',
        'ETHUSDT': 'crypto',
        'SOLUSDT': 'crypto',
        'PAXGUSDT': 'commodities'
    }

    def __init__(self, models_dir: str = "."):
        # Models are now in backend/trainers because train_dl.py saves them there, wait!
        # train_dl.py saves them to base_dir which is backend/
        # Wait, the code in train_dl.py:
        # base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # This is backend/
        self.models_dir = models_dir
        self.models = {}

    def _get_or_load_model(self, model_type: str, asset_class: str):
        key = f"{model_type}_{asset_class}"
        if key in self.models:
            return self.models[key]
            
        if model_type == "xgboost":
            path = os.path.join(self.models_dir, f"xgboost_{asset_class}.json")
            if os.path.exists(path) and xgb is not None:
                bst = xgb.Booster()
                bst.load_model(path)
                self.models[key] = bst
                print(f"Loaded {key} from {path}")
                return bst
        else:
            path = os.path.join(self.models_dir, f"{model_type}_{asset_class}.onnx")
            if os.path.exists(path) and ort is not None:
                session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
                self.models[key] = session
                print(f"Loaded {key} from {path}")
                return session
                
        return None

    def predict(self, history_data: list, model_type: str = "lstm", symbol: str = "BTCUSDT", interval: str = "15m") -> dict:
        """
        Dự đoán giá tương lai dựa trên dữ liệu lịch sử và loại mô hình được chọn.
        Lưu ý: Để chạy thực tế MTF, cần dữ liệu 1m, 5m, 15m, 1h, 4h.
        Hiện tại dùng mock output cho đến khi API hỗ trợ kéo đa khung thời gian.
        """
        asset_class = self.CLASS_MAP.get(symbol, 'crypto')
        model = self._get_or_load_model(model_type, asset_class)
        
        if model is None:
            # Fallback mock mode
            import random
            if isinstance(history_data, (list, np.ndarray)) and len(history_data) > 0:
                first_close = float(history_data[0][4])
                last_close = float(history_data[-1][4])
                trend = "up" if last_close >= first_close else "down"
                confidence = round(random.uniform(60.0, 95.0), 2)
            else:
                trend = "up"
                confidence = 75.5
                
            return {
                "status": "mock",
                "trend": trend,
                "confidence": confidence,
                "reason": f"Model '{model_type}' for {symbol} not loaded. Using dynamic mock ({trend})."
            }

        try:
            import numpy as np
            import pandas as pd
            import pandas_ta as ta

            if isinstance(history_data, (list, np.ndarray)) and len(history_data) > 0:
                df = pd.DataFrame(history_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
                df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
                df.set_index('timestamp', inplace=True)
                
                # Tính toán cơ bản 12 indicators
                df.ta.ema(length=20, append=True)
                df.ta.ema(length=50, append=True)
                df.ta.rsi(length=14, append=True)
                df.ta.macd(fast=12, slow=26, signal=9, append=True)
                df.ta.bbands(length=20, std=2, append=True)
                df.ta.atr(length=14, append=True)
                
                df.bfill(inplace=True)
                df.fillna(0, inplace=True)
                
                # Lấy 60 nến cuối cùng
                recent_df = df.tail(60)
                if len(recent_df) < 60:
                    # Pad if not enough
                    pad_len = 60 - len(recent_df)
                    pad_df = pd.DataFrame([recent_df.iloc[0].values]*pad_len, columns=recent_df.columns)
                    recent_df = pd.concat([pad_df, recent_df], ignore_index=True)
                
                features = recent_df.values # shape: (60, num_features)
                num_features = features.shape[1] # Thường là 5 OHLCV + 12 ind = 17
                
                # Scale rough approximation (min-max)
                features = (features - np.min(features, axis=0)) / (np.max(features, axis=0) - np.min(features, axis=0) + 1e-8)
                
                # Fill to 65 features by repeating (mocking MTF)
                full_features = np.zeros((60, 65), dtype=np.float32)
                for i in range(65):
                    full_features[:, i] = features[:, i % num_features]
                
                last_close = float(df['close'].iloc[-1])
            else:
                full_features = np.zeros((60, 65), dtype=np.float32)
                last_close = 1.0

            if model_type == "xgboost":
                import xgboost as xgb
                X_xgb = full_features.reshape(1, 60 * 65)
                dmatrix = xgb.DMatrix(X_xgb)
                pred = model.predict(dmatrix)[0]
                prob = float(pred)
            else:
                input_name = model.get_inputs()[0].name
                X_dl = full_features.reshape(1, 60, 65)
                ort_outs = model.run(None, {input_name: X_dl})
                pred = ort_outs[0][0]
                prob = float(pred[1]) if len(pred) > 1 else float(pred[0])

            trend = "up" if prob >= 0.5 else "down"
            confidence = round(max(prob, 1 - prob) * 100, 2)
            
            return {
                "status": "success",
                "trend": trend,
                "confidence": confidence,
                "reason": f"Predicted using {model_type.upper()} model for {symbol} (Deterministic MTF Fallback)."
            }
        except Exception as e:
            print(f"Prediction error with {model_type}: {e}")
            return {
                "status": "error",
                "trend": "down",
                "confidence": 50,
                "reason": str(e)
            }
