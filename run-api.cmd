@echo off
title BSBW API - port 4000
cd /d "%~dp0server"
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ============================================
echo   BSBW CRM - backend API
echo   http://localhost:4000
echo ============================================
echo.
call npm run dev
echo.
echo The API has stopped. Press any key to close.
pause >nul
