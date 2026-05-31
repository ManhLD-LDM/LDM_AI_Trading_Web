import torch
import numpy as np

# Script này yêu cầu torch. Hãy chạy nó trên máy có cài torch.
# Không chạy trên Render Free (do giới hạn 512MB RAM).

def export_kronos_to_onnx(model_path="kronos-mini.pt", output_path="kronos-mini.onnx"):
    try:
        # Load the mock/actual model here
        # Trong thực tế, bạn sẽ import model Kronos từ mã nguồn của nó:
        # from kronos import KronosModel
        # model = KronosModel()
        # model.load_state_dict(torch.load(model_path))
        
        print("Note: This is a placeholder export script.")
        print("To fully export Kronos, ensure the original Kronos repository is in your PYTHONPATH.")
        
        # Example dummy export to demonstrate the ONNX flow:
        class DummyModel(torch.nn.Module):
            def forward(self, x):
                return x * 1.01 # Mock prediction
                
        model = DummyModel()
        model.eval()

        # Input shape: (Batch Size, Sequence Length, Features)
        # Sequence Length = 512, Features = 5 (OHLCV)
        dummy_input = torch.randn(1, 512, 5)

        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            export_params=True,
            opset_version=14,
            do_constant_folding=True,
            input_names=['input_data'],
            output_names=['predicted_prices'],
            dynamic_axes={
                'input_data': {0: 'batch_size'},
                'predicted_prices': {0: 'batch_size'}
            }
        )
        print(f"Successfully exported to {output_path}")
        
    except Exception as e:
        print(f"Export failed: {e}")

if __name__ == "__main__":
    export_kronos_to_onnx()
