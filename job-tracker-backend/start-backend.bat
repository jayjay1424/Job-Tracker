@echo off
taskkill /F /IM node.exe /T 2>nul
echo Killed node processes
ping 127.0.0.1 -n 3 > nul
echo Starting backend...
cd /c/Users/jayrald/OneDrive/Desktop/Job Application Tracker/job-tracker-backend
start "job-tracker-backend" node src/index.js
echo Backend starting on port 4000
timeout /t 3 /nobreak > nul
echo Testing backend...
curl -s http://localhost:4000/api/health
echo.
echo Backend is running.
echo.
echo Frontend is already running on port 5173 (started earlier).
echo.
echo You can open:
echo   http://localhost:5173/   (frontend - Login/Signup pages)
echo   http://localhost:4000/   (backend API)
