import os
import sys
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report
import joblib

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trainers.data_utils import prepare_mtf_data

import numpy as np

ASSET_CLASSES = {
    "crypto": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    "commodities": ["PAXGUSDT"]
}

def train_for_class(class_name, symbols):
    print(f"\n{'='*50}\nBắt đầu Training XGBoost cho Class: {class_name.upper()}\n{'='*50}")
    
    all_X_train_chunks, all_y_train_chunks = [], []
    all_X_val_chunks, all_y_val_chunks = [], []
    all_X_test_chunks, all_y_test_chunks = [], []
    
    for symbol in symbols:
        print(f"Loading and processing {symbol}...")
        try:
            (X_train_chunks, y_train_chunks,
             X_val_chunks, y_val_chunks,
             X_test_chunks, y_test_chunks, feature_cols) = prepare_mtf_data(
                csv_path=f"{symbol}_1m_raw.csv", target_tf="15m", num_chunks=5, purge_len=60
            )
            
            all_X_train_chunks.extend(X_train_chunks)
            all_y_train_chunks.extend(y_train_chunks)
            
            all_X_val_chunks.extend(X_val_chunks)
            all_y_val_chunks.extend(y_val_chunks)
            
            all_X_test_chunks.extend(X_test_chunks)
            all_y_test_chunks.extend(y_test_chunks)
        except FileNotFoundError:
            print(f"Warning: Data for {symbol} not found. Run data_fetcher.py first.")
            continue
            
    if len(all_X_train_chunks) == 0:
        print(f"No data available to train class {class_name}.")
        return
        
    X_train = np.vstack(all_X_train_chunks)
    y_train = np.concatenate(all_y_train_chunks)
    
    X_val = np.vstack(all_X_val_chunks)
    y_val = np.concatenate(all_y_val_chunks)
    
    X_test = np.vstack(all_X_test_chunks)
    y_test = np.concatenate(all_y_test_chunks)
    
    # Create DMatrix for XGBoost
    dtrain = xgb.DMatrix(X_train, label=y_train)
    dval = xgb.DMatrix(X_val, label=y_val)
    dtest = xgb.DMatrix(X_test, label=y_test)
    
    params = {
        'objective': 'binary:logistic',
        'eval_metric': 'logloss',
        'max_depth': 5,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'seed': 42
    }
    
    evals = [(dtrain, 'train'), (dval, 'eval')]
    
    model = xgb.train(
        params,
        dtrain,
        num_boost_round=500,
        evals=evals,
        early_stopping_rounds=20,
        verbose_eval=False
    )
    
    preds_prob = model.predict(dtest)
    preds = (preds_prob > 0.5).astype(int)
    
    acc = accuracy_score(y_test, preds)
    print(f">>> XGBoost Test Accuracy for {class_name}: {acc:.4f} <<<")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    save_path = os.path.join(base_dir, f"xgboost_{class_name}.json")
    model.save_model(save_path)
    print(f"Model saved to {save_path}")

def train_xgboost():
    for class_name, symbols in ASSET_CLASSES.items():
        train_for_class(class_name, symbols)

if __name__ == "__main__":
    train_xgboost()
