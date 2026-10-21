@echo off
rem Build the installers on this PC (not the official release; those come from GitHub).
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node pnpm cargo || exit /b 1
call pnpm build || exit /b 1
echo.
echo Installers are in target\release\bundle ^(nsis = .exe, msi = .msi^).
start "" "%~dp0..\..\target\release\bundle"
