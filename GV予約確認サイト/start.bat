@echo off
title GV-Canoe-Reservation-Server

echo ===================================================
echo   GV Canoe Reservation - Local Web Server
echo ===================================================
echo.
echo [INFO] Starting Python HTTP server on port 5000...
echo.
echo 1. For PC Browser:
echo    http://localhost:5000
echo.
echo 2. For iPhone (Must be on the same Wi-Fi):
echo    Check the IP address list below and access:
echo    http://[YOUR_PC_IP]:5000
echo.
echo ---------------------------------------------------
echo [Your PC IP Address List (IPv4)]
ipconfig | findstr /i "ipv4"
echo ---------------------------------------------------
echo.
echo ===================================================
echo * Close this window to STOP the server.
echo ===================================================
echo.

python -m http.server 5000 --bind 0.0.0.0 --directory "%~dp0static"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start server using 'python'. Trying 'py' command...
    py -m http.server 5000 --bind 0.0.0.0 --directory "%~dp0static"
)

pause
