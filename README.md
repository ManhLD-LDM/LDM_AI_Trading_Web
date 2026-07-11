# LDM AI Trading Web

LDM AI Trading Web is a comprehensive, full-stack cryptocurrency trading platform powered by Artificial Intelligence. It features real-time market data analysis, paper trading capabilities, advanced risk management, and multi-model AI predictions (LSTM, TCN, Transformer, XGBoost) using ONNX runtime.

## 🚀 Features

- **Real-time Market Data:** Integrates with Binance WebSocket API for live price action and candlestick charts.
- **Multi-Timeframe AI Analysis (MTF):** Evaluates market trends across 5 timeframes (1m, 5m, 15m, 1h, 4h) using 65 technical features.
- **Ensemble ML Models:** Supports ONNX-based LSTM, TCN, and Transformer models, alongside XGBoost for robust trend prediction.
- **Paper Trading Engine:** Simulated trading environment with real-time PnL tracking and portfolio management.
- **Advanced Risk Management:** Built-in guardrails including:
  - Max Drawdown limits
  - Consecutive Loss breakers
  - Daily Loss limits
  - Position size capping
  - Signal cooldown periods
- **Alert System:** Real-time trade signals, risk warnings, and error alerts broadcasted via Discord Webhooks and Telegram bots.
- **Strategy Backtesting:** Test trading strategies against historical data with detailed metrics (ROI, Win Rate, Sharpe Ratio, Max Drawdown) and SVG equity curves.
- **Modern UI/UX:** Built with Next.js and Tailwind CSS featuring a sleek, dark-mode glassmorphism design.

## 🛠️ Technology Stack

### Backend
- **Framework:** FastAPI (Python 3.10+)
- **Database:** MongoDB Atlas (AsyncIOMotorClient)
- **Machine Learning:** ONNX Runtime, XGBoost, Pandas-TA
- **Real-time:** WebSockets, Asyncio
- **Auth:** JWT (JSON Web Tokens)

### Frontend
- **Framework:** Next.js (React)
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Icons:** Lucide React

## 📦 Installation & Setup

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher
- MongoDB Atlas account (or local MongoDB)

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   Copy `.env.example` to `.env` and update the values:
   ```env
   MONGO_URI=mongodb+srv://<user>:<password>@cluster0...
   DB_NAME=ldm_trading_db
   JWT_SECRET_KEY=your_super_secret_key
   ALLOWED_ORIGINS=http://localhost:3000
   ```
5. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```
4. Run the Next.js development server:
   ```bash
   npm run dev
   ```

## 🧠 AI Models Directory (`backend/`)
Pre-trained models should be placed in the `backend/` directory:
- `lstm_crypto.onnx`
- `tcn_crypto.onnx`
- `transformer_crypto.onnx`
- `xgboost_crypto.json` (or `.onnx`)
*(The system will gracefully fallback to mock predictions if models are missing).*

## ⚠️ Troubleshooting

**MongoDB Connection Errors (503 Service Unavailable):**
- Ensure your MongoDB Atlas cluster is active (not paused).
- Verify that your current IP address is whitelisted in MongoDB Atlas (Network Access).
- Check if your `MONGO_URI` is correct.

## 📄 License

This project is proprietary and confidential.
