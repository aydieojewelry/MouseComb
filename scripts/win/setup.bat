@echo off
rem Install what the repo needs. Run once, and again after pulling new changes.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node pnpm cargo go || exit /b 1
call pnpm install || exit /b 1
echo.
echo Ready. Next: scripts\win\dev.bat ^(UI in your browser^) or scripts\win\app.bat ^(the real app^).
