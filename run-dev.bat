@echo off
setlocal
cd /d "%~dp0app-source"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
echo Starting VR Catch Arena dev server on http://localhost:5173 ...
call npm.cmd run dev -- --host
