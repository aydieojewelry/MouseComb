@echo off
rem Used by the other scripts: call _need.bat tool [tool ...]
rem Stops with a plain message when a tool isn't installed.
setlocal
set MISSING=
:next
if "%~1"=="" goto done
where %~1 >nul 2>nul || set MISSING=%MISSING% %~1
shift
goto next
:done
if defined MISSING (
  echo.
  echo Missing:%MISSING%
  echo Install what is missing, then run this again:
  echo   node 22 ^(nodejs.org^) and pnpm 10 ^(npm i -g pnpm^)
  echo   cargo ^(rustup.rs^)   go 1.27 ^(go.dev^)   cloudflared ^(only for tunnel.bat^)
  exit /b 1
)
exit /b 0
