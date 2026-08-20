@echo off
chcp 65001 >nul
cd /d "%~dp0"
title IMe Music ? empty profile (screenshots)

echo.
echo  Empty profile for screenshots
echo  Your real library in %%APPDATA%%\IMe Music is NOT used.
echo  Data folder: %~dp0.screenshot-profile
echo.

for %%D in ("release-v101" "release") do (
  if exist "%%~D\IMe Music-Portable-1.0.1.exe" (
    echo  Starting portable 1.0.1...
    start "" "%%~D\IMe Music-Portable-1.0.1.exe" --user-data-dir="%~dp0.screenshot-profile"
    exit /b 0
  )
  if exist "%%~D\IMe Music-Portable-1.0.0.exe" (
    echo  Starting portable 1.0.0...
    start "" "%%~D\IMe Music-Portable-1.0.0.exe" --user-data-dir="%~dp0.screenshot-profile"
    exit /b 0
  )
  if exist "%%~D\win-unpacked\IMe Music.exe" (
    echo  Starting unpacked build...
    start "" "%%~D\win-unpacked\IMe Music.exe" --user-data-dir="%~dp0.screenshot-profile"
    exit /b 0
  )
)

echo  No built exe found ? starting empty DEV mode (needs Node.js)...
echo  Wait for the IMe Music window (not the browser).
echo.
call npm run dev:empty
pause
