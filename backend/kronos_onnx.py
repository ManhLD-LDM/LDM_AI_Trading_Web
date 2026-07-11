import numpy as np
import os
import asyncio
import pandas as pd
import pandas_ta as ta
from logger import model_logger

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

# ─── MTF timeframes and indicator counts ──────────────────────────────────────
MTF_INTERVALS = ['1m', '5m', '15m', '1h', '4h']
# Per timeframe: EMA20, EMA50, RSI14, MACD_line, MACD_signal, BB_upper, BB_lower, ATR14 = 8 + close = 9 → 9×5 = 45 features
FEATURES_PER_TF = 9
N_TIMEFRAMES = len(MTF_INTERVALS)
TOTAL_FEATURES = FEATURES_PER_TF * N_TIMEFRAMES  # 45; model expects 65 → padded
SEQ_LEN = 60


def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute 9 technical indicators + close from an OHLCV DataFrame."""
    df = df.copy()
    df.ta.ema(length=20, append=True)
    df.ta.ema(length=50, append=True)
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)
    df.ta.atr(length=14, append=True)

    cols = [
        'close',
        'EMA_20', 'EMA_50',
        'RSI_14',
        'MACD_12_26_9', 'MACDs_12_26_9',
        'BBU_20_2.0', 'BBL_20_2.0',
        'ATRr_14',
    ]
    # Use available columns (names may differ between pandas_ta versions)
    available = []
    for c in cols:
        matching = [col for col in df.columns if c in col]
        if matching:
            available.append(matching[0])
        elif c == 'close':
            available.append('close')

    result = df[available].copy()
    result.bfill(inplace=True)
    result.fillna(0, inplace=True)
    return result


def _df_from_klines(klines: list) -> pd.DataFrame:
    """Convert raw kline list to a pandas DataFrame."""
    df = pd.DataFrame(klines, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)
    return df


def _build_mtf_features(mtf_data: dict) -> np.ndarray:
    """
    Build (SEQ_LEN, 65) feature matrix from MTF kline data.
    Each timeframe contributes FEATURES_PER_TF columns.
    If total < 65, pad with zeros to reach expected model input shape.
    """
    tf_features = []

    for tf in MTF_INTERVALS:
        klines = mtf_data.get(tf, [])
        if len(klines) < 30:
            # Not enough data — use zeros for this timeframe
            tf_features.append(np.zeros((SEQ_LEN, FEATURES_PER_TF), dtype=np.float32))
            continue

        df = _df_from_klines(klines)
        ind_df = _compute_indicators(df)

        # Reindex to SEQ_LEN rows
        arr = ind_df.values.astype(np.float32)
        if len(arr) < SEQ_LEN:
            pad = np.tile(arr[:1], (SEQ_LEN - len(arr), 1))
            arr = np.vstack([pad, arr])
        else:
            arr = arr[-SEQ_LEN:]

        # Normalise each column to [0,1]
        mins = arr.min(axis=0)
        maxs = arr.max(axis=0)
        arr = (arr - mins) / (maxs - mins + 1e-8)

        # Keep exactly FEATURES_PER_TF columns
        if arr.shape[1] >= FEATURES_PER_TF:
            arr = arr[:, :FEATURES_PER_TF]
        else:
            pad_cols = np.zeros((SEQ_LEN, FEATURES_PER_TF - arr.shape[1]), dtype=np.float32)
            arr = np.hstack([arr, pad_cols])

        tf_features.append(arr)

    # Stack all timeframes side-by-side → (SEQ_LEN, N_TIMEFRAMES × FEATURES_PER_TF)
    combined = np.hstack(tf_features)  # (60, 45)

    # Pad to 65 features (model's expected input)
    if combined.shape[1] < 65:
        pad_cols = np.zeros((SEQ_LEN, 65 - combined.shape[1]), dtype=np.float32)
        combined = np.hstack([combined, pad_cols])

    return combined.astype(np.float32)


class ModelEnsemble:
    CLASS_MAP = {
        'BTCUSDT': 'crypto',
        'ETHUSDT': 'crypto',
        'SOLUSDT': 'crypto',
        'PAXGUSDT': 'commodities'
    }

    def __init__(self, models_dir: str = "."):
        self.models_dir = models_dir
        self.models = {}

    def _get_or_load_model(self, model_type: str, asset_class: str):
        key = f"{model_type}_{asset_class}"
        if key in self.models:
            return self.models[key]

        if model_type == "xgboost":
            # Try native XGBoost .json first
            json_path = os.path.join(self.models_dir, f"xgboost_{asset_class}.json")
            if os.path.exists(json_path) and xgb is not None:
                bst = xgb.Booster()
                bst.load_model(json_path)
                self.models[key] = bst
                model_logger.info(f"Loaded XGBoost (native) from {json_path}")
                return bst
            # Fall back to ONNX export of XGBoost
            onnx_path = os.path.join(self.models_dir, f"xgboost_{asset_class}.onnx")
            if os.path.exists(onnx_path) and ort is not None:
                session = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
                self.models[key] = session
                model_logger.info(f"Loaded XGBoost (ONNX) from {onnx_path}")
                return session
            model_logger.warning(f"XGBoost model not found for {asset_class} (tried .json and .onnx)")
        else:
            path = os.path.join(self.models_dir, f"{model_type}_{asset_class}.onnx")
            if os.path.exists(path) and ort is not None:
                session = ort.InferenceSession(path, providers=['CPUExecutionProvider'])
                self.models[key] = session
                model_logger.info(f"Loaded {key} from {path}")
                return session

        return None

    async def predict_async(self, mtf_data: dict, model_type: str = "lstm",
                            symbol: str = "BTCUSDT", interval: str = "15m") -> dict:
        """
        Main async prediction entry point.
        mtf_data: dict from get_mtf_klines() — {"1m": [...], "5m": [...], ...}
        Returns trend, confidence, and status dict.
        """
        asset_class = self.CLASS_MAP.get(symbol, 'crypto')
        model = self._get_or_load_model(model_type, asset_class)

        # Determine last close from the smallest timeframe available
        last_close = 0.0
        for tf in MTF_INTERVALS:
            klines = mtf_data.get(tf, [])
            if klines:
                last_close = float(klines[-1][4])
                break

        if model is None:
            # Graceful fallback using price direction
            import random
            if mtf_data:
                first_tf = MTF_INTERVALS[0]
                kl = mtf_data.get(first_tf, [])
                if len(kl) >= 2:
                    trend = "up" if float(kl[-1][4]) >= float(kl[0][4]) else "down"
                else:
                    trend = "up"
            else:
                trend = "up"
            confidence = round(random.uniform(60.0, 95.0), 2)
            return {
                "status": "mock",
                "trend": trend,
                "confidence": confidence,
                "reason": f"Model '{model_type}' for {symbol} not loaded. Mock mode ({trend})."
            }

        try:
            # Build feature matrix in thread so we don't block event loop
            full_features = await asyncio.to_thread(_build_mtf_features, mtf_data)

            if model_type == "xgboost":
                # XGBoost: try .json first, fall back to ONNX session
                X_flat = full_features.reshape(1, SEQ_LEN * 65)
                if xgb is not None and hasattr(model, 'predict'):
                    # Native XGBoost booster (.json)
                    dmatrix = xgb.DMatrix(X_flat)
                    pred_raw = await asyncio.to_thread(model.predict, dmatrix)
                    prob = float(pred_raw[0])
                else:
                    # ONNX session fallback
                    input_name = model.get_inputs()[0].name
                    ort_outs = await asyncio.to_thread(model.run, None, {input_name: X_flat})
                    raw_out = ort_outs[0].flatten()
                    prob = float(raw_out[-1])  # last value = probability of class 1
            else:
                # LSTM / TCN / Transformer — ONNX, input shape [1, 60, 65]
                input_name = model.get_inputs()[0].name
                X_dl = full_features.reshape(1, SEQ_LEN, 65)
                ort_outs = await asyncio.to_thread(model.run, None, {input_name: X_dl})
                raw_out = ort_outs[0].flatten()
                if len(raw_out) == 1:
                    # Sigmoid output: single value in [0,1]
                    prob = float(raw_out[0])
                elif len(raw_out) == 2:
                    # Softmax output: [p_class0, p_class1]
                    prob = float(raw_out[1])
                else:
                    prob = float(raw_out[-1])

            trend = "up" if prob >= 0.5 else "down"
            confidence = round(max(prob, 1 - prob) * 100, 2)

            return {
                "status": "success",
                "trend": trend,
                "confidence": confidence,
                "model_type": model_type,
                "reason": f"{model_type.upper()} MTF prediction for {symbol} ({N_TIMEFRAMES} timeframes). p={prob:.4f}",
            }

        except Exception as e:
            model_logger.error(f"Prediction error [{model_type}/{symbol}]: {e}")
            return {
                "status": "error",
                "trend": "down",
                "confidence": 50,
                "reason": str(e)
            }

    def predict(self, history_data, model_type: str = "lstm",
                symbol: str = "BTCUSDT", interval: str = "15m") -> dict:
        """Legacy sync wrapper — wraps single-TF history_data into MTF-compatible dict."""
        if isinstance(history_data, list) and len(history_data) > 0:
            mtf_data = {interval: [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in history_data]}
        elif hasattr(history_data, 'tolist'):
            mtf_data = {interval: [[int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])] for r in history_data.tolist()]}
        else:
            mtf_data = {}
        return asyncio.run(self.predict_async(mtf_data, model_type, symbol, interval))
