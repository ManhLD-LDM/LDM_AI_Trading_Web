import numpy as np
import os

try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    import joblib
except ImportError:
    joblib = None

class ModelEnsemble:
    def __init__(self, models_dir: str = "."):
        self.models_dir = models_dir
        self.models = {}
        
        # Load ONNX models
        for name in ["lstm", "tcn", "transformer"]:
            path = os.path.join(self.models_dir, f"{name}.onnx")
            if os.path.exists(path) and ort is not None:
                try:
                    self.models[name] = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
                    print(f"Loaded {name} model from {path}")
                except Exception as e:
                    print(f"Error loading {name}: {e}")
            else:
                if ort is None:
                    print(f"Warning: onnxruntime not installed, skipping {name}")
                else:
                    print(f"Warning: {path} not found")
                
        # Load XGBoost
        xgb_path = os.path.join(self.models_dir, "xgboost.pkl")
        if os.path.exists(xgb_path) and joblib is not None:
            try:
                self.models["xgboost"] = joblib.load(xgb_path)
                print(f"Loaded XGBoost model from {xgb_path}")
            except Exception as e:
                print(f"Error loading xgboost: {e}")
        else:
            if joblib is None:
                print("Warning: joblib not installed, skipping XGBoost")
            else:
                print(f"Warning: {xgb_path} not found")

    def predict(self, history_data: np.ndarray, model_type: str = "lstm") -> dict:
        """
        Dự đoán giá tương lai dựa trên dữ liệu lịch sử và loại mô hình được chọn.
        """
        if model_type not in self.models:
            # Fallback mock mode
            import random
            if isinstance(history_data, (list, np.ndarray)) and len(history_data) > 0:
                first_close = float(history_data[0][4]) # Index 4 is Close
                last_close = float(history_data[-1][4]) # Index 4 is Close
                trend = "up" if last_close >= first_close else "down"
                confidence = round(random.uniform(60.0, 95.0), 2)
            else:
                trend = "up"
                confidence = 75.5
                
            return {
                "status": "mock",
                "trend": trend,
                "confidence": confidence,
                "reason": f"Model '{model_type}' not loaded. Using dynamic mock ({trend})."
            }

        try:
            if model_type == "xgboost":
                # XGBoost expects 50 candles flattened (OHLCV only)
                history_no_ts = np.array(history_data[-50:])[:, 1:] # Drop timestamp
                input_data = history_no_ts.reshape(1, -1)
                prob = self.models["xgboost"].predict_proba(input_data)[0][1]
                trend = "up" if prob > 0.5 else "down"
                confidence = float(prob if prob > 0.5 else 1 - prob) * 100
            else:
                # Deep Learning expects (1, 512, 5) shape
                session = self.models[model_type]
                input_name = session.get_inputs()[0].name
                # Ensure we have exactly 512 candles if possible, or pad/truncate
                if len(history_data) >= 512:
                    input_data = np.array(history_data[-512:])[:, 1:].astype(np.float32)
                else:
                    # Pad with zeros if not enough data
                    input_data = np.zeros((512, 5), dtype=np.float32)
                    actual_data = np.array(history_data)[:, 1:].astype(np.float32)
                    input_data[-len(history_data):] = actual_data
                
                input_data = np.expand_dims(input_data, axis=0)
                prob = session.run(None, {input_name: input_data})[0][0][0]
                trend = "up" if prob > 0.5 else "down"
                confidence = float(prob if prob > 0.5 else 1 - prob) * 100

            return {
                "status": "success",
                "trend": trend,
                "confidence": min(confidence, 100.0),
                "model": model_type
            }
        except Exception as e:
            print(f"Inference error for {model_type}: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
