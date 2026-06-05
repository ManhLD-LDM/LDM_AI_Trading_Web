import numpy as np
import pandas as pd
import pandas_ta as ta
from sklearn.preprocessing import MinMaxScaler
import joblib
import os

def calculate_indicators(df, prefix=""):
    """
    Tính toán technical indicators.
    """
    # Clone to avoid SettingWithCopyWarning
    df = df.copy()
    
    # Calculate indicators
    df.ta.ema(length=20, append=True)
    df.ta.ema(length=50, append=True)
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)
    df.ta.atr(length=14, append=True)
    
    # Rename columns to include timeframe prefix
    cols_to_rename = [col for col in df.columns if col not in ['open', 'high', 'low', 'close', 'volume']]
    rename_dict = {col: f"{prefix}_{col}" for col in cols_to_rename}
    df.rename(columns=rename_dict, inplace=True)
    
    return df

def resample_and_shift(df_1m, timeframe):
    """
    Gộp nến từ 1m lên khung thời gian cao hơn, tính toán indicator, 
    sau đó SHIFT 1 ĐƠN VỊ ĐỂ TRÁNH LOOKAHEAD BIAS.
    """
    resampled = df_1m.resample(timeframe, closed='left', label='left').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    })
    
    # Tính indicator trên khung lớn
    resampled = calculate_indicators(resampled, prefix=timeframe)
    
    # Quan trọng nhất: Shift toàn bộ dataframe xuống 1 dòng.
    # Ví dụ nến 15m lúc 10:00 (chứa dữ liệu từ 10:00 đến 10:14) 
    # sau khi shift sẽ có index là 10:15.
    # Nhờ vậy, tại thời điểm 10:14, dữ liệu này CHƯA XUẤT HIỆN.
    # -> KHÔNG THỂ BỊ RÒ RỈ TƯƠNG LAI!
    resampled.index = resampled.index + pd.to_timedelta(timeframe)
    
    # Drop OHLCV gốc vì đã có trong 1m, chỉ giữ lại các indicator
    indicator_cols = [c for c in resampled.columns if c not in ['open', 'high', 'low', 'close', 'volume']]
    return resampled[indicator_cols]

def prepare_mtf_data(csv_path="BTCUSDT_1m_raw.csv", target_tf="15m", num_chunks=5, purge_len=60):
    """
    Reads 1m data, creates MTF features, labels, and Train/Val/Test.
    target_tf: Timeframe used for labeling target.
    num_chunks: Number of independent time blocks for Multi-Regime Split.
    purge_len: Number of candles to drop at boundaries to prevent lookahead leakage.
    
    Returns lists of numpy arrays (each element is a chunk) so that DL models
    can generate sequences per chunk without boundary overlap.
    """
    print("Loading 1m raw data...")
    if not os.path.isabs(csv_path):
        csv_path = os.path.join(r"E:\myPrj\candle_data", csv_path)
        
    df_1m = pd.read_csv(csv_path)
    df_1m['timestamp'] = pd.to_datetime(df_1m['timestamp'])
    df_1m.set_index('timestamp', inplace=True)
    
    df_1m = calculate_indicators(df_1m, prefix="1m")
    
    print("Resampling to Higher Timeframes (5m, 15m, 1h, 4h)...")
    df_5m = resample_and_shift(df_1m, '5min')
    df_15m = resample_and_shift(df_1m, '15min')
    df_1h = resample_and_shift(df_1m, '1H')
    df_4h = resample_and_shift(df_1m, '4H')
    
    print("Merging features...")
    df_merged = df_1m.copy()
    
    for df_tf in [df_5m, df_15m, df_1h, df_4h]:
        df_merged = pd.merge_asof(df_merged, df_tf, left_index=True, right_index=True, direction='backward')
        
    df_merged.dropna(inplace=True)
    
    print(f"Creating labels for target timeframe {target_tf}...")
    shift_periods = int(pd.to_timedelta(target_tf).total_seconds() // 60)
    df_merged['target'] = (df_merged['close'].shift(-shift_periods) > df_merged['close']).astype(int)
    df_merged.dropna(inplace=True)
    
    feature_cols = [c for c in df_merged.columns if c != 'target']
    print(f"Total features created: {len(feature_cols)}")
    
    print(f"Applying Block Chunking with Purging (Chunks: {num_chunks}, Purge: {purge_len})...")
    chunk_size = len(df_merged) // num_chunks
    
    train_dfs, val_dfs, test_dfs = [], [], []
    
    for i in range(num_chunks):
        start = i * chunk_size
        end = start + chunk_size if i < num_chunks - 1 else len(df_merged)
        chunk = df_merged.iloc[start:end]
        
        L = len(chunk)
        idx1 = int(L * 0.7)
        idx2 = int(L * 0.85)
        
        train_chunk = chunk.iloc[0:idx1]
        val_chunk = chunk.iloc[idx1+purge_len : idx2]
        test_chunk = chunk.iloc[idx2+purge_len : L]
        
        if len(train_chunk) > 0: train_dfs.append(train_chunk)
        if len(val_chunk) > 0: val_dfs.append(val_chunk)
        if len(test_chunk) > 0: test_dfs.append(test_chunk)
        
    print("Fitting Scaler on ALL Training data only...")
    df_train_all = pd.concat(train_dfs)
    scaler = MinMaxScaler()
    scaler.fit(df_train_all[feature_cols].values)
    
    # Extract symbol from csv_path (e.g., BTCUSDT_1m_raw.csv -> BTCUSDT)
    basename = os.path.basename(csv_path)
    symbol_name = basename.split("_")[0]
    
    scaler_path = os.path.join(os.path.dirname(__file__), f"scaler_MTF_{symbol_name}_{target_tf}.gz")
    joblib.dump(scaler, scaler_path)
    
    # Scale and separate features vs targets
    def process_chunks(df_list):
        X_list, y_list = [], []
        for df in df_list:
            X_scaled = scaler.transform(df[feature_cols].values)
            y = df['target'].values
            X_list.append(X_scaled)
            y_list.append(y)
        return X_list, y_list

    X_train_chunks, y_train_chunks = process_chunks(train_dfs)
    X_val_chunks, y_val_chunks = process_chunks(val_dfs)
    X_test_chunks, y_test_chunks = process_chunks(test_dfs)
    
    return (X_train_chunks, y_train_chunks, 
            X_val_chunks, y_val_chunks, 
            X_test_chunks, y_test_chunks, 
            feature_cols)

def create_sequences(X, y, seq_length=60):
    if len(X) <= seq_length:
        return np.array([]), np.array([])
    X_seq, y_seq = [], []
    for i in range(len(X) - seq_length):
        X_seq.append(X[i:(i + seq_length)])
        y_seq.append(y[i + seq_length])
    return np.array(X_seq), np.array(y_seq)

