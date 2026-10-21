@echo off
rem Check the docs: links, [[wikilinks]], the TOON blocks in CR\CR.md, and the commands they list.
rem "docs.bat --fmt" rewrites the TOON blocks in their standard layout.
setlocal
cd /d "%~dp0..\.."
call "%~dp0_need.bat" node || exit /b 1
node scripts\docs-check.mjs %*
