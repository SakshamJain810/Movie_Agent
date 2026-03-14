@echo off
echo Starting MovieAgent...
cd /d "c:\Users\saksh\OneDrive\Desktop\Movie search"

:: Kill any existing node processes
taskkill /F /IM node.exe 2>nul

:: Start Backend via PM2 (auto-restart on crash)
pm2 start ecosystem.config.cjs --only movie-agent-backend

:: Start Frontend in background
start "MovieAgent Frontend" /min cmd /c "npm run dev"

timeout /t 3 >nul
echo.
echo *** MovieAgent is Running! ***
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
start http://localhost:5173
pause
