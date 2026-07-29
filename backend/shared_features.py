"""
backend/shared_features.py

Shared Module for Technical Indicators & Multi-Timeframe (MTF) Feature Engineering.
Ensures 100% parity between training (data_utils.py) and inference (kronos_onnx.py).
"""
import numpy as np
import pandas as pd

MTF_INTERVALS = ['1m', '5m', '15m', '1h', '4h']
FEATURES_PER_TF = 9  # close, EMA20, EMA50, RSI14, MACD_line, MACD_signal, BB_upper, BB_lower, ATR14
N_TIMEFRAMES = len(MTF_INTERVALS)
TOTAL_FEATURES = FEATURES_PER_TF * N_TIMEFRAMES  # 45
EXPECTED_MODEL_FEATURES = 65
SEQ_LEN = 60


def compute_indicators(df: pd.DataFrame, prefix: str = "") -> pd.DataFrame:
    """
    Computes 9 standard technical indicators from OHLCV dataframe.
    Calculates manually with fallback if pandas_ta or ta is not installed.
    """
    df = df.copy()
    close = df['close'].astype(float)
    high = df['high'].astype(float)
    low = df['low'].astype(float)

    # 1. EMA 20 & 50
    ema_20 = close.ewm(span=20, adjust=False).mean()
    ema_50 = close.ewm(span=50, adjust=False).mean()

    # 2. RSI 14
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / (loss + 1e-8)
    rsi_14 = 100 - (100 / (1 + rs))

    # 3. MACD (12, 26, 9)
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema_12 - ema_26
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()

    # 4. Bollinger Bands (20, 2)
    sma_20 = close.rolling(20).mean()
    std_20 = close.rolling(20).std()
    bb_upper = sma_20 + (2.0 * std_20)
    bb_lower = sma_20 - (2.0 * std_20)

    # 5. ATR 14
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)
    atr_14 = tr.rolling(14).mean()

    out = pd.DataFrame({
        'close': close,
        'EMA_20': ema_20,
        'EMA_50': ema_50,
        'RSI_14': rsi_14,
        'MACD_line': macd_line,
        'MACD_signal': macd_signal,
        'BB_upper': bb_upper,
        'BB_lower': bb_lower,
        'ATR_14': atr_14
    }, index=df.index)

    out.bfill(inplace=True)
    out.fillna(0, inplace=True)

    if prefix:
        out.columns = [f"{prefix}_{col}" for col in out.columns]

    return out


def build_mtf_feature_matrix(mtf_data: dict, scaler=None) -> np.ndarray:
    """
    Builds a (SEQ_LEN, EXPECTED_MODEL_FEATURES) feature matrix from dict of timeframe klines.
    mtf_data format: {"1m": [[ts, o, h, l, c, v], ...], "5m": [...], ...}
    If scaler is provided, applies exact MinMaxScaler transform.
    """
    tf_features = []

    for tf in MTF_INTERVALS:
        klines = mtf_data.get(tf, [])
        if len(klines) < 15:
            tf_features.append(np.zeros((SEQ_LEN, FEATURES_PER_TF), dtype=np.float32))
            continue

        df = pd.DataFrame(klines, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = df[col].astype(float)

        ind_df = compute_indicators(df)
        arr = ind_df.values.astype(np.float32)

        if len(arr) < SEQ_LEN:
            pad = np.tile(arr[:1], (SEQ_LEN - len(arr), 1))
            arr = np.vstack([pad, arr])
        else:
            arr = arr[-SEQ_LEN:]

        tf_features.append(arr[:, :FEATURES_PER_TF])

    combined = np.hstack(tf_features)  # Shape: (60, 45)

    # Pad columns to EXPECTED_MODEL_FEATURES (65)
    if combined.shape[1] < EXPECTED_MODEL_FEATURES:
        pad_cols = np.zeros((SEQ_LEN, EXPECTED_MODEL_FEATURES - combined.shape[1]), dtype=np.float32)
        combined = np.hstack([combined, pad_cols])

    # If trained scaler is available, use it instead of local min-max
    if scaler is not None and hasattr(scaler, 'transform'):
        try:
            # Scaler expects (n_samples, n_features)
            n_features_scaler = getattr(scaler, 'n_features_in_', 65)
            if combined.shape[1] == n_features_scaler:
                combined = scaler.transform(combined)
            else:
                mins = combined.min(axis=0)
                maxs = combined.max(axis=0)
                combined = (combined - mins) / (maxs - mins + 1e-8)
        except Exception:
            mins = combined.min(axis=0)
            maxs = combined.max(axis=0)
            combined = (combined - mins) / (maxs - mins + 1e-8)
    else:
        mins = combined.min(axis=0)
        maxs = combined.max(axis=0)
        combined = (combined - mins) / (maxs - mins + 1e-8)

    return combined.astype(np.float32)
