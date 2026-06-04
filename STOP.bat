@echo off
echo ===================================================
echo     LDM AI TRADING - STOP SERVICES
echo ===================================================
echo.

echo Dang dung tat ca cac tien trinh (Frontend va Backend)...
taskkill /FI "WINDOWTITLE eq LDM_Backend_*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq LDM_Frontend_*" /T /F >nul 2>&1

echo.
echo Cung the tat force cac process dang chay o cong 3000 va 8000 (Neu can)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do taskkill /f /pid %%a >nul 2>&1

echo.
echo Da dung tat ca dich vu!
pause
