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
    print(f"\n{'='*50}\nStarting Training Deep Learning for Class: {class_name.upper()}\n{'='*50}")
    
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
    
    from torch.utils.data import Dataset, DataLoader
    import time
    
    class ChunkedSequenceDataset(Dataset):
        def __init__(self, X_chunks, y_chunks, seq_length=60):
            self.seq_length = seq_length
            self.X_chunks = [torch.tensor(x, dtype=torch.float32) for x in X_chunks]
            self.y_chunks = [torch.tensor(y, dtype=torch.long) for y in y_chunks]
            
            self.chunk_offsets = []
            self.chunk_lengths = []
            total_len = 0
            for x in self.X_chunks:
                valid_len = max(0, len(x) - seq_length)
                self.chunk_lengths.append(valid_len)
                self.chunk_offsets.append(total_len)
                total_len += valid_len
                
            self.total_length = total_len
            
        def __len__(self):
            return self.total_length
            
        def __getitem__(self, idx):
            for i in range(len(self.chunk_offsets)-1, -1, -1):
                if idx >= self.chunk_offsets[i]:
                    chunk_idx = i
                    local_idx = idx - self.chunk_offsets[i]
                    break
                    
            X = self.X_chunks[chunk_idx][local_idx : local_idx + self.seq_length]
            y = self.y_chunks[chunk_idx][local_idx + self.seq_length]
            return X, y

    # Limit CPU usage to leave room for other tasks
    torch.set_num_threads(8)
    
    # Setup GPU device if available
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # Use the memory-efficient Dataset (NO data duplication)
    train_dataset = ChunkedSequenceDataset(all_X_train_chunks, all_y_train_chunks, SEQ_LENGTH)
    train_loader = DataLoader(train_dataset, batch_size=2048, shuffle=True, pin_memory=True if device.type=='cuda' else False)
    
    val_dataset = ChunkedSequenceDataset(all_X_val_chunks, all_y_val_chunks, SEQ_LENGTH)
    val_loader = DataLoader(val_dataset, batch_size=2048, shuffle=False, pin_memory=True if device.type=='cuda' else False)
    
    test_dataset = ChunkedSequenceDataset(all_X_test_chunks, all_y_test_chunks, SEQ_LENGTH)
    test_loader = DataLoader(test_dataset, batch_size=2048, shuffle=False)
    
    models = {
        f"lstm_{class_name}.onnx": LSTMModel(input_size).to(device),
        f"tcn_{class_name}.onnx": TCNModel(input_size).to(device),
        f"transformer_{class_name}.onnx": TransformerModel(input_size).to(device)
    }
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    for name, model in models.items():
        print(f"Training {name} on {device}...")
        optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-5)
        criterion = nn.CrossEntropyLoss()
        
        best_val_loss = float('inf')
        patience = 15
        patience_counter = 0
        
        for epoch in range(100):
            model.train()
            train_loss = 0.0
            for batch_X, batch_y in train_loader:
                batch_X, batch_y = batch_X.to(device), batch_y.to(device)
                optimizer.zero_grad()
                output = model(batch_X)
                loss = criterion(output, batch_y)
                loss.backward()
                optimizer.step()
                train_loss += loss.item() * batch_X.size(0)
                
                # Sleep briefly to avoid 100% GPU/CPU utilization
                time.sleep(0.01)
            
            train_loss /= len(train_loader.dataset)
            
            model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for batch_X, batch_y in val_loader:
                    batch_X, batch_y = batch_X.to(device), batch_y.to(device)
                    val_out = model(batch_X)
                    loss = criterion(val_out, batch_y)
                    val_loss += loss.item() * batch_X.size(0)
            
            val_loss /= len(val_loader.dataset)
                
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                torch.save(model.state_dict(), f"best_{name}.pt")
            else:
                patience_counter += 1
                
            if patience_counter >= patience:
                print(f"Early stopping at epoch {epoch}")
                break
                
        # Load best model for testing & export
        model.load_state_dict(torch.load(f"best_{name}.pt", weights_only=True))
        model.eval()
        
        with torch.no_grad():
            test_preds_list = []
            test_true_list = []
            for batch_X, batch_y in test_loader:
                batch_X = batch_X.to(device)
                test_out = model(batch_X)
                test_preds_list.append(test_out.argmax(dim=1).cpu())
                test_true_list.append(batch_y.cpu())
            
            if test_preds_list:
                test_preds = torch.cat(test_preds_list)
                test_trues = torch.cat(test_true_list)
                correct = (test_preds == test_trues).sum().item()
                accuracy = correct / len(test_trues) if len(test_trues) > 0 else 0
                print(f">>> {name} Test Accuracy: {accuracy:.4f} <<<")
            else:
                print(f">>> {name} Test Accuracy: 0.0000 <<<")
            
        save_path = os.path.join(base_dir, name)
        dummy_input = torch.randn(1, SEQ_LENGTH, input_size).to(device)
        # Move model to CPU before export for generic ONNX CPU inference
        model.to('cpu')
        dummy_input_cpu = dummy_input.cpu()
        torch.onnx.export(model, dummy_input_cpu, save_path, input_names=['input'], output_names=['output'])
        print(f"Exported {save_path}")


def train_and_export():
    for class_name, symbols in ASSET_CLASSES.items():
        train_for_class(class_name, symbols)

if __name__ == "__main__":
    train_and_export()
