@echo off
rem Everything CI checks, in order. Stops at the first failure. Start backend.bat first
rem to include the sync tests; without it they are skipped.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node pnpm cargo || exit /b 1
curl -s -o nul http://127.0.0.1:8090/api/health && set MC_TEST_PB_URL=http://127.0.0.1:8090
if defined MC_TEST_PB_URL (echo Backend found: sync tests included.) else (echo No backend running: sync tests skipped.)
cargo fmt --all || goto :failed
cargo clippy --workspace --all-targets -- -D warnings || goto :failed
cargo test --workspace || goto :failed
call pnpm -r typecheck || goto :failed
call pnpm -r test || goto :failed
node --test "scripts/*.test.mjs" || goto :failed
node scripts\docs-check.mjs || goto :failed
call pnpm --filter @mousecomb/desktop build || goto :failed
echo.
echo All checks passed.
exit /b 0
:failed
echo.
echo A check failed: fix it above, then run check.bat again.
exit /b 1
