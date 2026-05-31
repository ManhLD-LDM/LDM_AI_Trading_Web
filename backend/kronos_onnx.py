import onnxruntime as ort
import numpy as np
import os

class KronosInference:
    def __init__(self, model_path: str = "kronos-mini.onnx"):
        self.model_path = model_path
        self.session = None
        
        # Cố gắng load mô hình nếu file tồn tại
        if os.path.exists(self.model_path):
            try:
                # Sử dụng CPUExecutionProvider để tối ưu cho Render Free
                self.session = ort.InferenceSession(self.model_path, providers=['CPUExecutionProvider'])
                print(f"Successfully loaded ONNX model: {self.model_path}")
            except Exception as e:
                print(f"Failed to load ONNX model: {e}")
        else:
            print(f"Warning: ONNX model not found at {self.model_path}. Will run in mock mode.")

    def predict(self, history_data: np.ndarray, horizon: int = 120) -> dict:
        """
        Dự đoán giá tương lai dựa trên dữ liệu lịch sử.
        history_data: numpy array shape (512, 5) - [Open, High, Low, Close, Volume]
        """
        if self.session is None:
            # Fallback mock mode nếu chưa có file ONNX
            return {
                "status": "mock",
                "trend": "up",
                "confidence": 75.5,
                "reason": "Model not loaded. Using mock trend."
            }

        try:
            # Tiền xử lý data giống như mô hình gốc yêu cầu
            # Vd: scale, normalize... (Giả định mô hình nhận đầu vào chuẩn)
            input_data = np.expand_dims(history_data, axis=0) # Shape: (1, 512, 5)
            
            # Tên input node (cần khớp với file onnx)
            input_name = self.session.get_inputs()[0].name
            
            # Chạy inference
            outputs = self.session.run(None, {input_name: input_data})
            
            # Xử lý kết quả trả về từ Kronos
            # Giả định outputs[0] là array chứa giá dự đoán
            pred_prices = outputs[0][0]
            
            # Tính toán xu hướng đơn giản dựa trên giá dự đoán
            first_pred = pred_prices[0]
            last_pred = pred_prices[-1]
            trend = "up" if last_pred > first_pred else "down"
            confidence = float(abs(last_pred - first_pred) / first_pred * 100) # Dummy confidence metric

            return {
                "status": "success",
                "trend": trend,
                "confidence": min(confidence, 100.0),
                "predicted_prices": pred_prices.tolist()
            }
        except Exception as e:
            print(f"Inference error: {e}")
            return {
                "status": "error",
                "error": str(e)
            }
