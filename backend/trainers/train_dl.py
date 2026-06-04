import torch
import torch.nn as nn
import torch.optim as optim
import asyncio
import os
import sys

# Thêm đường dẫn tới backend để import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from trainers.data_utils import fetch_train_data, create_sequences
from trainers.models import LSTMModel, TCNModel, TransformerModel

async def train_and_export():
    ohlcv, _ = await fetch_train_data(limit=1000)
    X, y = create_sequences(ohlcv, seq_length=512)
    X_tensor = torch.tensor(X, dtype=torch.float32)
    y_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(1)
    
    models = {
        "lstm.onnx": LSTMModel(),
        "tcn.onnx": TCNModel(),
        "transformer.onnx": TransformerModel()
    }
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    for name, model in models.items():
        print(f"Training {name}...")
        optimizer = optim.Adam(model.parameters(), lr=0.01)
        criterion = nn.BCELoss()
        
        # Train 5 epochs basic
        for epoch in range(5):
            optimizer.zero_grad()
            output = model(X_tensor)
            loss = criterion(output, y_tensor)
            loss.backward()
            optimizer.step()
            
        # Export ONNX
        save_path = os.path.join(base_dir, name)
        dummy_input = torch.randn(1, 512, 5)
        torch.onnx.export(model, dummy_input, save_path, input_names=['input'], output_names=['output'])
        print(f"Exported {save_path}")

if __name__ == "__main__":
    asyncio.run(train_and_export())
