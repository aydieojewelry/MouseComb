@echo off
rem Run after changing a Tauri command or event: regenerates packages\bindings.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" cargo || exit /b 1
call pnpm bindings
