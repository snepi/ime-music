@echo off
chcp 65001 >nul
cd /d "%~dp0"
title IMe Music — empty profile (screenshots)

echo.
echo  Empty profile for screenshots
echo  Your real library in %%APPDATA%%\IMe Music is NOT used.
echo  Data folder: %~dp0.screenshot-profile
echo.

if exist "release\IMe Music-Portable-1.0.0.exe" (
  echo  Starting portable build...
  start "" "release\IMe Music-Portable-1.0.0.exe" --user-data-dir="%~dp0.screenshot-profile"
  exit /b 0
)

if exist "release\win-unpacked\IMe Music.exe" (
  echo  Starting unpacked build...
  start "" "release\win-unpacked\IMe Music.exe" --user-data-dir="%~dp0.screenshot-profile"
  exit /b 0
)

echo  No built exe found — starting empty DEV mode (needs Node.js)...
echo  Wait for the IMe Music window (not the browser).
echo.
call npm run dev:empty
pause
