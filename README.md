# 🤖 LDM AI Trading Web - Advanced Algorithmic Trading Platform

> Nền tảng giao dịch thuật toán AI đa tài sản (Cryptocurrency & Commodities) full-stack tiên tiến. Kết hợp mô hình Deep Learning Ensemble (LSTM, TCN, Transformer ONNX) và hệ thống Multi-Agent AI với động cơ quản trị rủi ro tự động và giả lập giao dịch thời gian thực.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js_15-000000?logo=nextdotjs)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Language-Python_3.11+-3776AB?logo=python)](https://python.org)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript)](https://typescriptlang.org)
[![ONNX Runtime](https://img.shields.io/badge/AI_Engine-ONNX_Runtime-005FE6?logo=onnx)](https://onnxruntime.ai)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB_Atlas-47A248?logo=mongodb)](https://mongodb.com)

---

## 🌟 Điểm nổi bật (Core Features)

### 1. 🧠 Hệ thống Dự đoán AI Ensemble (Multi-Model AI Engine)
* **Mô hình Deep Learning kết hợp**: Tích hợp các mô hình **LSTM**, **TCN (Temporal Convolutional Network)**, **Transformer** được xuất dưới dạng **ONNX Runtime** kết hợp với **XGBoost** để đạt độ chính xác cao nhất.
* **Phân tích đa khung thời gian (Multi-Timeframe)**: Tự động tổng hợp và xử lý dữ liệu trên 5 khung thời gian (`1m`, `5m`, `15m`, `1h`, `4h`) với hơn 65 chỉ báo kỹ thuật.
* **Phân tích cho đa tài sản**: Hỗ trợ dự đoán xu hướng cho cả thị trường Crypto (`BTC`, `ETH`,...) và Hàng hóa/Commodities (`GOLD`, `OIL`,...).

### 2. 🤖 Hệ thống Multi-Agent AI (Phân nhiệm Thông minh)
* **Technical Agent**: Phân tích kỹ thuật chuyên sâu, trích xuất đặc trưng và tính toán chỉ số tín hiệu.
* **Sentiment Agent**: Sử dụng **LLM Google Gemini AI API** để phân tích tin tức thị trường và tâm lý đám đông (CryptoPanic news integration).
* **Trader Agent**: Tổng hợp tín hiệu kỹ thuật & tâm lý, ra quyết định vào lệnh (LONG/SHORT) kèm quản trị vị thế.

### 3. ⚡ Thực thi Giao dịch & Quản trị Rủi ro (Execution & Risk Manager)
* **Paper Trading Simulator**: Môi trường giao dịch giả lập với số dư ảo, cập nhật PnL thời gian thực qua WebSocket mà không rủi ro vốn thật.
* **Live Trading Binance**: Kết nối trực tiếp tài khoản Binance (Futures & Spot). Khóa API sàn được **mã hóa bảo mật Fernet** trước khi lưu vào database.
* **Động cơ Quản trị Rủi ro (Risk Guardrails)**:
  * Cắt mạch lỗ liên tiếp (*Consecutive Loss Breaker*).
  * Giới hạn mức sụt giảm tài khoản tối đa trong ngày (*Daily Max Drawdown*).
  * Giới hạn đòn bẩy & quy mô vị thế (*Position Capping*).
  * Nút dừng khẩn cấp toàn bộ vị thế (*Emergency Kill Switch*).

### 4. 📊 Backtesting Engine & Cảnh báo (Backtest & Alerts)
* **Backtest chuyên sâu**: Kiểm thử chiến lược với dữ liệu lịch sử, hỗ trợ đòn bẩy, SL/TP, slippage, phí giao dịch. Xuất các chỉ số ROI, Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown và biểu đồ đường cong vốn (Equity Curve).
* **Hệ thống Cảnh báo (Alerts)**: Gửi thông báo tín hiệu giao dịch và biến động rủi ro tức thì qua **Discord Webhooks** và **Telegram Bot**.

---

## 🏗️ Kiến trúc Công nghệ (Tech Stack)

### Backend (`/backend`)
* **Framework**: Python 3.11+ / FastAPI
* **Database**: MongoDB Atlas (kết nối bất đồng bộ qua `motor`)
* **AI Machine Learning**: ONNX Runtime, PyTorch, XGBoost, Pandas-TA
* **Real-Time Data**: WebSockets, Python `asyncio`
* **Security & Auth**: JWT Tokens, Bcrypt, Fernet Encryption (Mã hóa API Key), SlowAPI (Rate Limiting)

### Frontend (`/frontend`)
* **Framework**: Next.js 15 (App Router), React 19, TypeScript
* **State Management**: Zustand (Lưu trữ trạng thái lệnh, cài đặt chỉ báo, cấu hình token)
* **Styling & UI**: Tailwind CSS, Lucide React icons
* **Charts**: Custom Chart Components / Recharts / Lightweight Charts
* **Networking**: Axios, WebSockets

---

## 📁 Cấu trúc Dự án (Project Structure)

```
LDM_AI_Trading_Web/
├── backend/                      # Python FastAPI Server & AI Engine
│   ├── exchange/                 # Module kết nối sàn (Binance Executor, Key Manager)
│   ├── routers/                  # API Endpoints (/api/backtest, /api/paper, /api/live)
│   ├── trainers/                 # Mã nguồn huấn luyện mô hình AI (LSTM, TCN, Transformer)
│   ├── agents.py                 # Multi-Agent Logic (Technical, Sentiment, Trader)
│   ├── alert_manager.py          # Hệ thống gửi cảnh báo Discord & Telegram
│   ├── auth.py                   # Quản lý xác thực JWT & Hash mật khẩu
│   ├── backtest_engine.py        # Động cơ chạy Backtest lịch sử
│   ├── binance_api.py            # Kết nối lấy dữ liệu nến Binance API
│   ├── database.py               # Kết nối MongoDB Atlas (Motor Client)
│   ├── kronos_onnx.py            # Động cơ nạp & thực thi mô hình ONNX Ensemble
│   ├── main.py                   # FastAPI Entry Point & WebSocket Connection Manager
│   ├── risk_manager.py           # Động cơ kiểm soát rủi ro vị thế
│   ├── .env.example              # Mẫu cấu hình biến môi trường Backend
│   └── requirements.txt          # Danh sách thư viện Python
│
├── frontend/                     # Next.js Web Dashboard
│   ├── src/
│   │   ├── app/                  # Next.js App Router pages
│   │   ├── components/           # UI Components (Chart, Toolbar, LiveTrading, PaperTrading, Backtest...)
│   │   ├── store/                # Zustand State Management
│   │   └── lib/                  # Utilities & API Axios Client
│   ├── package.json
│   └── tsconfig.json
│
├── START.bat                     # Script chạy Production Mode (Backend :8000 + Frontend Build & Run :3000)
├── START_DEV.bat                 # Script chạy Development Mode (FastAPI Reload + Next.js Dev)
└── STOP.bat                      # Script tắt toàn bộ tiến trình Backend & Frontend
```

---

## 🚀 Hướng dẫn Khởi chạy (Getting Started)

### Yêu cầu tiên quyết (Prerequisites)
* **Python**: Phiên bản `3.10` trở lên (Khuyến nghị Python 3.11)
* **Node.js**: Phiên bản `v18.x` trở lên ([Tải tại đây](https://nodejs.org))
* **MongoDB**: Tài khoản MongoDB Atlas (Cloud) hoặc MongoDB chạy ở máy local.

---

### 1. Cấu hình Biến môi trường (Environment Setup)

Tạo file `backend/.env` bằng cách sao chép từ `backend/.env.example`:

```env
# Kết nối MongoDB Atlas
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority
DB_NAME=ldm_trading_db

# Môi trường
ENVIRONMENT=development

# JWT Authentication (Tạo chuỗi ngẫu nhiên bảo mật)
JWT_SECRET_KEY=your_super_secret_jwt_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS Whitelist (Phẩy cách nhau)
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Khóa API Gemini cho Sentiment Agent (Tùy chọn)
GEMINI_API_KEY=your_gemini_api_key_here

# Khóa mã hóa Fernet cho Binance API Key
ENCRYPTION_KEY=your_fernet_encryption_key

# Cảnh báo (Tùy chọn)
DISCORD_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Tạo file `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

### 2. Chạy nhanh trên Windows (Quick Start with Scripts)

Dự án có sẵn các script tự động khởi tạo và quản lý ứng dụng:

* **Chế độ Phát triển (Development Launcher)**:
  Nhấp đúp chuột vào file **`START_DEV.bat`**.
  * FastAPI Backend (Hot-Reload) sẽ chạy tại: `http://localhost:8000`
  * Next.js Frontend sẽ chạy tại: `http://localhost:3000`
  * WebSocket live feed: `ws://localhost:8000/ws`

* **Chế độ Production (Production Launcher)**:
  Nhấp đúp chuột vào file **`START.bat`**.
  * Tự động kích hoạt môi trường ảo `.venv`, build giao diện Next.js và khởi chạy cả hai dịch vụ.

* **Dừng ứng dụng**:
  Nhấp đúp chuột vào file **`STOP.bat`** để tắt sạch các tiến trình Python & Node.js đang chạy trên các cổng `8000` và `3000`.

---

### 3. Khởi chạy Thủ công (Manual Command Line)

#### Backend Setup
```bash
cd backend
python -m venv .venv
# Trên Windows:
.venv\Scripts\activate
# Trên Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev     # Truy cập http://localhost:3000
```

---

## 🔒 Kiểm tra Bảo mật (Security & Privacy Audit)

* **Không chứa mật khẩu lộ**: File `.env` chứa chìa khóa kết nối thực tế được lưu tại máy local và đã được chặn **100%** bởi file `.gitignore`.
* **Mã hóa API Keys của người dùng**: API Key và Secret Sàn Binance được mã hóa đối xứng Fernet trước khi lưu vào MongoDB Atlas.
* **Rate Limiting**: Sử dụng SlowAPI để giới hạn số lượng request, chống brute-force đăng nhập và ngăn ngừa spam Webhook.

---

## 📄 Giấy phép (License)

Dự án được phát triển phục vụ mục đích nghiên cứu, học tập và thử nghiệm giao dịch tự động cá nhân.

---
Made with ❤️ for AI Algorithmic Trading!
