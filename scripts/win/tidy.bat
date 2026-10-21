@echo off
rem Refresh git and show what is left over. Deletes nothing: say tidy to your agent to clean up.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" git || exit /b 1
git fetch --all --prune --tags
echo.
echo Branches (anything besides main should have an open pull request):
git branch -a
echo.
echo Already merged into main:
git branch -r --merged origin/main
echo.
echo Latest tags:
git tag --sort=-creatordate
