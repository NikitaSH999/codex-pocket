@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo Building app...
call npm run build
if errorlevel 1 goto :fail

echo Starting Codex Mobile WebUI...
call npm start
if errorlevel 1 goto :fail

goto :eof

:fail
echo.
echo Codex Mobile WebUI failed to start.
pause
exit /b 1
