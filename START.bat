@echo off
echo ===================================================
echo     LDM AI TRADING - PRODUCTION LAUNCHER
echo ===================================================
echo.

echo [1/2] Dang khoi dong FastAPI Backend (Port 8000)...
start "LDM_Backend_Prod" cmd /k "cd backend && call .venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000"

echo [2/2] Dang Build va Khoi dong Next.js Frontend (Port 3000)...
start "LDM_Frontend_Prod" cmd /k "cd frontend && npm install && npm run build && npm start"

echo.
echo ===================================================
echo     TAT CA SERVICES DANG CHAY TRONG CUA SO MOI
echo ===================================================
echo.
echo - Web App (Frontend): http://localhost:3000
echo - API Server (Backend): http://127.0.0.1:8000
echo.
echo Luu y: Frontend se tu dong build truoc khi start (khoang 1-2 phut).
echo Nhan phim bat ky de thoat launcher nay (Services van chay)...
pause >nul
