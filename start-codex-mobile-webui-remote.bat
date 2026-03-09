@echo off
setlocal
cd /d "%~dp0"

set ALLOW_REMOTE=true
set AUTO_PORTMAP=true
set RULE_NAME=Codex Mobile WebUI 4318

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo Ensuring Windows Firewall allows inbound TCP 4318...
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>nul
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=4318 >nul

echo Building app...
call npm run build
if errorlevel 1 goto :fail

echo Starting Codex Mobile WebUI in public network mode with automatic UPnP port mapping...
call npm start
if errorlevel 1 goto :fail

goto :eof

:fail
echo.
echo Codex Mobile WebUI failed to start.
pause
exit /b 1
