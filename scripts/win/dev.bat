@echo off
rem The UI in your browser with example data: http://localhost:1420
rem Pages: #/general  #/bindings  #/snippets  #/whats-new  #/omnibar  #/hud
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node pnpm || exit /b 1
start "" "http://localhost:1420"
call pnpm --filter @mousecomb/desktop dev
