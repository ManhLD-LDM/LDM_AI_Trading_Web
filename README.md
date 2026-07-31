# 🤖 LDM AI Trading Web - Advanced Algorithmic Trading Platform

> Nền tảng giao dịch thuật toán AI đa tài sản (Cryptocurrency & Commodities) full-stack tiên tiến. Kết hợp mô hình Deep Learning Ensemble (LSTM, TCN, Transformer ONNX), động cơ tính toán mức giá toán học 100% (Math-Based Trading Plan Engine) và hệ thống Multi-Agent AI với quản trị rủi ro đa khung thời gian.

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js_15-000000?logo=nextdotjs)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Language-Python_3.11+-3776AB?logo=python)](https://python.org)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript)](https://typescriptlang.org)
[![ONNX Runtime](https://img.shields.io/badge/AI_Engine-ONNX_Runtime-005FE6?logo=onnx)](https://onnxruntime.ai)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB_Atlas-47A248?logo=mongodb)](https://mongodb.com)

---

## 🌟 Điểm nổi bật (Core Features)

### 1. 🧠 Mô hình Deep Learning Ensemble & Technical Signal Scorer
* **Mô hình AI Ensemble**: Tích hợp các mô hình **LSTM**, **TCN (Temporal Convolutional Network)**, **Transformer** dạng **ONNX Runtime** kết hợp với **XGBoost** dự đoán xu hướng thị trường.
* **Technical Signal Scorer (`signal_scorer.py`)**: Chấm điểm tín hiệu kỹ thuật cứng (0-100 điểm) dựa trên 65+ chỉ báo và hợp lưu đa khung thời gian (`15m`, `1h`, `4h`, `1D`, `1W`). Ra quyết định 3 trạng thái: `LONG`, `SHORT`, hoặc `WAIT`.

### 2. 📐 Math-Based Trading Plan Engine (Động cơ Lập Kế hoạch 100% Toán học)
* **Tính toán mức giá chính xác**: Mức giá **Entry Zone**, **Stop Loss (SL)** và **Take Profit (TP1, TP2)** được tính toán hoàn toàn bằng thuật toán toán học (ATR, Swing High/Low, Pivot Support/Resistance). LLM không tự bịa ra giá trị ngẫu nhiên.
* **Xử lý tín hiệu ĐỨNG NGOÀI (WAIT)**: Khi AI khuyến nghị `WAIT` (Đứng ngoài), toàn bộ mốc giá Entry, SL, TP được đưa về `0` / rỗng nhằm tránh ảo giá và đảm bảo an toàn tài khoản.
* **Chế độ SCALP & SWING**: Tự động tùy biến khoảng Entry và tỷ lệ R:R theo phong cách lướt sóng ngắn (`SCALP`) hoặc đánh xu hướng dài (`SWING`). Cho phép người dùng tùy chỉnh/override mốc TP/SL cá nhân.

### 3. 🤖 Hệ thống Multi-Agent AI (Phân nhiệm Thông minh)
* **TechnicalAgent**: Phân tích kỹ thuật đa khung thời gian (MTF), trích xuất chỉ số & mô hình nến.
* **SentimentAgent**: Tổng hợp tin tức từ **CryptoPanic API** và phân tích tâm lý đám đông bằng **Google Gemini LLM**.
* **TraderAgent**: Hợp nhất điểm kỹ thuật + Math Plan + Gemini LLM để đưa ra bài phân tích tiếng Việt chi tiết.
* **PendingAuditAgent**: Tự động đánh giá rủi ro & khả năng khớp TP/SL của các lệnh chờ trước khi điều chỉnh.
* **PostMortemAgent**: AI tự rút kinh nghiệm và tổng kết bài học sau khi lệnh kết thúc (`WIN`, `LOSS`, `SL`).

### 4. ⚡ Thực thi Giao dịch & Quản trị Rủi ro (Execution & Risk Manager)
* **Interactive Chart & Setup Overlay**: Gắn mốc Entry, SL, TP trực tiếp lên biểu đồ TradingView chính hoặc xem qua Lightweight Chart tương tác trong Modal chi tiết.
* **Paper Trading Simulator**: Giả lập giao dịch số dư ảo với PnL cập nhật thời gian thực qua WebSocket.
* **Live Trading Binance**: Kết nối trực tiếp tài khoản Binance Futures & Spot. API Key được **mã hóa bảo mật Fernet** trong database.
* **Risk Guardrails**: Cắt mạch lỗ liên tiếp (*Consecutive Loss Breaker*), giới hạn sụt giảm tài khoản trong ngày (*Daily Max Drawdown*), giới hạn đòn bẩy và nút dừng khẩn cấp (*Emergency Kill Switch*).

### 5. 📊 Backtesting Engine & Cảnh báo (Backtest & Alerts)
* **Backtest lịch sử**: Kiểm thử chiến lược với nến quá khứ, hỗ trợ đòn bẩy, SL/TP, slippage và phí giao dịch. Xuất chỉ số Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown và đường cong vốn (Equity Curve).
* **Alert Manager**: Gửi thông báo tín hiệu tức thì qua **Discord Webhooks** và **Telegram Bot**.

---

## 🏗️ Kiến trúc Công nghệ (Tech Stack)

### Backend (`/backend`)
* **Framework**: Python 3.11+ / FastAPI
* **Database**: MongoDB Atlas (kết nối bất đồng bộ qua `motor`)
* **AI & Quant**: ONNX Runtime, PyTorch, XGBoost, Pandas-TA, Math Plan Builder Engine
* **Real-Time Data**: WebSockets, Python `asyncio`, Binance API
* **Security & Auth**: JWT Tokens, Passlib/Bcrypt, Fernet Encryption (Mã hóa API Key), SlowAPI (Rate Limiting)

### Frontend (`/frontend`)
* **Framework**: Next.js 15 (App Router), React 19, TypeScript
* **State Management**: Zustand (Lưu trữ lịch sử AI Consult, trạng thái lệnh, chỉ báo, auth token)
* **Styling & UI**: Tailwind CSS, Lucide React icons
* **Charts**: Lightweight Charts (TradingView) & Custom Canvas Components
* **Networking**: Axios, WebSockets

---

## 📁 Cấu trúc Dự án (Project Structure)

```
LDM_AI_Trading_Web/
├── backend/                      # Python FastAPI Server & AI Engine
│   ├── exchange/                 # Module kết nối sàn (Binance Executor, Key Manager)
│   ├── routers/                  # API Endpoints (/api/live, /api/paper, /api/backtest)
│   ├── trainers/                 # Mã nguồn huấn luyện mô hình AI (LSTM, TCN, Transformer)
│   ├── agents.py                 # Multi-Agent Logic (Technical, Sentiment, Trader, Audit)
│   ├── signal_scorer.py          # Bộ chấm điểm tín hiệu kỹ thuật đa khung (0-100)
│   ├── math_plan_builder.py      # Thuật toán tính mốc Entry/SL/TP toán học 100%
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
│   │   ├── components/           # UI Components (AIConsultantCard, AIOrderDetailsModal, Chart, Sidebar...)
│   │   ├── store/                # Zustand State Management (useStore.ts)
│   │   └── lib/                  # Utilities & API Client
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

# JWT Authentication
JWT_SECRET_KEY=your_super_secret_jwt_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS Whitelist
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Khóa API Gemini cho Sentiment & Multi-Agent AI
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

* **Chế độ Phát triển (Development Launcher)**:
  Nhấp đúp chuột vào file **`START_DEV.bat`**.
  * FastAPI Backend (Hot-Reload) tại: `http://localhost:8000`
  * Next.js Frontend tại: `http://localhost:3000`
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

## 🔒 Bảo mật & An toàn (Security & Privacy Audit)

* **Bảo vệ Secret & API Keys**: File `.env` chứa chìa khóa kết nối được loại bỏ 100% khỏi git tracking qua `.gitignore`.
* **Mã hóa Fernet**: API Key / Secret Binance của người dùng được mã hóa Fernet trước khi lưu trữ database.
* **Rate Limiting**: Sử dụng SlowAPI để chống spam request và tấn công brute-force.
* **Tính toán Giá Deterministic**: Loại bỏ rủi ro ảo giá do LLM tự bịa nhờ động cơ `math_plan_builder.py`.

---

## 📄 Giấy phép (License)

Dự án được phát triển phục vụ mục đích nghiên cứu, học tập và thử nghiệm giao dịch tự động cá nhân.

---

Made with ❤️ for AI Algorithmic Trading!
