@echo off
rem The real app (Tauri) with live reload. For sync, run backend.bat in another window first.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node pnpm cargo || exit /b 1
call pnpm dev
