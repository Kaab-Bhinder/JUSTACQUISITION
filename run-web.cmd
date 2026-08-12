@echo off
title BSBW Web - port 5173
cd /d "%~dp0web"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ============================================
echo   BSBW CRM - frontend
echo   http://localhost:5173
echo ============================================
echo.
call npm run dev
echo.
echo The frontend has stopped. Press any key to close.
pause >nul
