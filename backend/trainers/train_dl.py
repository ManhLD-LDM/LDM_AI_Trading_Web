import torch
import torch.nn as nn
import torch.optim as optim
import asyncio
import os
import sys
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trainers.data_utils import prepare_mtf_data, create_sequences
from trainers.models import LSTMModel, TCNModel, TransformerModel

ASSET_CLASSES = {
    "crypto": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    "commodities": ["PAXGUSDT"]
}

def train_for_class(class_name, symbols):
    print(f"\n{'='*50}\nBắt đầu Training Deep Learning cho Class: {class_name.upper()}\n{'='*50}")
    
    all_X_train_chunks, all_y_train_chunks = [], []
    all_X_val_chunks, all_y_val_chunks = [], []
    all_X_test_chunks, all_y_test_chunks = [], []
    feature_cols_ref = None
    
    for symbol in symbols:
        print(f"Loading and processing {symbol}...")
        try:
            (X_train_chunks, y_train_chunks,
             X_val_chunks, y_val_chunks,
             X_test_chunks, y_test_chunks, feature_cols) = prepare_mtf_data(
                csv_path=f"{symbol}_1m_raw.csv", target_tf="15m", num_chunks=5, purge_len=60
            )
            
            if feature_cols_ref is None:
                feature_cols_ref = feature_cols
                
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

    input_size = len(feature_cols_ref)
    SEQ_LENGTH = 60
    
    def chunks_to_seq(X_chunks, y_chunks):
        X_seq_all, y_seq_all = [], []
        for X, y in zip(X_chunks, y_chunks):
            X_s, y_s = create_sequences(X, y, seq_length=SEQ_LENGTH)
            if len(X_s) > 0:
                X_seq_all.append(X_s)
                y_seq_all.append(y_s)
        if len(X_seq_all) == 0:
            return np.array([]), np.array([])
        return np.vstack(X_seq_all), np.concatenate(y_seq_all)

    X_train, y_train = chunks_to_seq(all_X_train_chunks, all_y_train_chunks)
    X_val, y_val = chunks_to_seq(all_X_val_chunks, all_y_val_chunks)
    X_test, y_test = chunks_to_seq(all_X_test_chunks, all_y_test_chunks)
    
    # Convert to PyTorch Tensors
    X_train_t = torch.tensor(X_train, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)
    
    X_val_t = torch.tensor(X_val, dtype=torch.float32)
    y_val_t = torch.tensor(y_val, dtype=torch.float32).unsqueeze(1)
    
    X_test_t = torch.tensor(X_test, dtype=torch.float32)
    y_test_t = torch.tensor(y_test, dtype=torch.float32).unsqueeze(1)
    
    models = {
        f"lstm_{class_name}.onnx": LSTMModel(input_size),
        f"tcn_{class_name}.onnx": TCNModel(input_size),
        f"transformer_{class_name}.onnx": TransformerModel(input_size)
    }
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    for name, model in models.items():
        print(f"Training {name}...")
        optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-5)
        criterion = nn.BCELoss()
        
        best_val_loss = float('inf')
        patience = 15
        patience_counter = 0
        
        for epoch in range(100):
            model.train()
            optimizer.zero_grad()
            output = model(X_train_t)
            loss = criterion(output, y_train_t)
            loss.backward()
            optimizer.step()
            
            model.eval()
            with torch.no_grad():
                val_out = model(X_val_t)
                val_loss = criterion(val_out, y_val_t)
                
            if val_loss.item() < best_val_loss:
                best_val_loss = val_loss.item()
                patience_counter = 0
                torch.save(model.state_dict(), f"best_{name}.pt")
            else:
                patience_counter += 1
                
            if patience_counter >= patience:
                break
                
        # Load best model for testing & export
        model.load_state_dict(torch.load(f"best_{name}.pt"))
        model.eval()
        
        with torch.no_grad():
            test_out = model(X_test_t)
            test_preds = (test_out > 0.5).float()
            correct = (test_preds == y_test_t).sum().item()
            accuracy = correct / len(y_test_t) if len(y_test_t) > 0 else 0
            print(f">>> {name} Test Accuracy: {accuracy:.4f} <<<")
            
        save_path = os.path.join(base_dir, name)
        dummy_input = torch.randn(1, SEQ_LENGTH, input_size)
        torch.onnx.export(model, dummy_input, save_path, input_names=['input'], output_names=['output'])
        print(f"Exported {save_path}")

def train_and_export():
    for class_name, symbols in ASSET_CLASSES.items():
        train_for_class(class_name, symbols)

if __name__ == "__main__":
    train_and_export()
