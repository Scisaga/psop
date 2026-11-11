@echo off
setlocal
cd /d "%~dp0apps\workbench"
if exist ".runtime\node-v22.23.4-win-x64\node.exe" set "PATH=%CD%\.runtime\node-v22.23.4-win-x64;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.12 or later is required. Please install Node.js and try again.
  pause
  exit /b 1
)
node scripts/launch.mjs %*
if errorlevel 1 (
  pause
  exit /b 1
)
