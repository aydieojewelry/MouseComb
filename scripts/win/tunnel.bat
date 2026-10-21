@echo off
rem Share the local backend with another device through a Cloudflare quick tunnel.
rem   tunnel.bat          the backend, port 8090
rem   tunnel.bat 1420     the UI preview instead
rem It prints an https://....trycloudflare.com address: paste it into Settings, Account and sync,
rem as the server. The address changes every time, and anyone who has it can reach that port.
setlocal
call "%~dp0_need.bat" cloudflared || exit /b 1
set PORT=%~1
if "%PORT%"=="" set PORT=8090
cloudflared tunnel --url http://127.0.0.1:%PORT%
