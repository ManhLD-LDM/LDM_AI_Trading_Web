@echo off
echo ===================================================
echo     LDM AI TRADING - LOCAL TEST LAUNCHER
echo ===================================================
echo.

echo [1/2] Dang khoi dong FastAPI Backend (Port 8000)...
start "LDM_Backend_Dev" cmd /k "cd backend && call .venv\Scripts\activate.bat && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Dang khoi dong Next.js Frontend (Port 3000)...
start "LDM_Frontend_Dev" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo     TAT CA SERVICES DANG CHAY TRONG CUA SO MOI
echo ===================================================
echo.
echo - Web App (Frontend): http://localhost:3000
echo - API Server (Backend): http://127.0.0.1:8000
echo - WebSocket Endpoint: ws://127.0.0.1:8000/ws
echo.
echo Vui long giu 2 cua so cmd den kia mo de server tiep tuc chay.
echo Nhan phim bat ky de thoat launcher nay...
pause >nul
