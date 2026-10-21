@echo off
rem The backend (PocketBase) on http://127.0.0.1:8090. Keep this window open.
rem Admin dashboard: http://127.0.0.1:8090/_/
setlocal
call "%~dp0_need.bat" go || exit /b 1
cd /d "%~dp0..\..\services\pocketbase"
go run . serve --http 127.0.0.1:8090
