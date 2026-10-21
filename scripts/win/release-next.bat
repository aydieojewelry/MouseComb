@echo off
rem What the next release would be, from "## Next" in CHANGELOG.md. Changes nothing.
rem To make it real, ask your agent to release: it cuts the section, opens the pull request and merges after you approve.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node git || exit /b 1
node scripts\version.mjs status
echo.
node scripts\version.mjs release --dry
