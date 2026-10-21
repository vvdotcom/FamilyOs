@echo off
rem Starts the Hometide TV app in a web browser at http://localhost:8082,
rem talking to the live Hometide service. Double-click this file, or run it from a terminal.
rem Leave this window open while you use the app; close it (or press Ctrl+C) to stop.
cd /d "%~dp0"
set "EXPO_PUBLIC_FAMILYOS_API_URL=https://hometide.up.railway.app"
echo Checking packages...
call npx.cmd -y corepack@0.34.0 yarn install --immutable
if errorlevel 1 (
  echo.
  echo Package install failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo Starting the TV app. Open http://localhost:8082 in Chrome when it says "Web is waiting".
call npx.cmd -y corepack@0.34.0 yarn dev:web
pause
