@echo off
echo ===================================================
echo     LDM AI TRADING - LOCAL TEST LAUNCHER
echo ===================================================
echo.

echo [1/2] Đang khởi động FastAPI Backend (Port 8000)...
start "LDM Backend" cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Đang khởi động Next.js Frontend (Port 3000)...
start "LDM Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo     TẤT CẢ SERVICES ĐANG CHẠY TRONG CỬA SỔ MỚI
echo ===================================================
echo.
echo - Web App (Frontend): http://localhost:3000
echo - API Server (Backend): http://127.0.0.1:8000
echo - WebSocket Endpoint: ws://127.0.0.1:8000/ws
echo.
echo Vui lòng giữ 2 cửa sổ cmd đen kia mở để server tiếp tục chạy.
echo Nhấn phím bất kỳ để thoát launcher này...
pause >nul
