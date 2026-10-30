@echo off
title TubeGrab Pro - YouTube Downloader Server
cd /d "%~dp0"

echo ========================================================
echo   Starting TubeGrab Pro - YouTube Downloader Web App
echo ========================================================
echo.
echo [1/2] Checking Python environment...
python --version
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b
)

echo.
echo [2/2] Launching Flask Server on http://127.0.0.1:5000...
echo Open your browser at: http://127.0.0.1:5000
echo Press Ctrl+C in this window to stop the server.
echo.

start http://127.0.0.1:5000
python app.py

pause
