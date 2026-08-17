@echo off
title Avantis Hardware Support System Launcher
echo ===================================================
echo   AVANTiS Hardware Support
echo   Product of Zimbabwe
echo ===================================================
echo.
echo Starting microservices and background agent...
echo.

start "Avantis Backend API" cmd /c "cd /d %~dp0..\backend && node src/server.js"
timeout /t 2 /nobreak >nul

start "Avantis Background Agent" cmd /c "cd /d %~dp0..\agent && node src/index.js"
timeout /t 2 /nobreak >nul

start "Avantis Customer Desktop UI" cmd /c "cd /d %~dp0..\client-ui && node server.js"
timeout /t 2 /nobreak >nul

echo.
echo [OK] Services successfully launched!
echo.
echo - Background Agent IPC:       http://localhost:9140
echo - Cloud Backend API:          http://localhost:9141
echo - Customer Support Dashboard: http://localhost:9142
echo.
echo Press any key to run hardware verification suite...
pause >nul
node "%~dp0test_hardware.js"
pause
