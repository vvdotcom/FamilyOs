@echo off
rem Starts the Hometide TV app in the browser with the built-in sample family (no API needed),
rem at http://localhost:8082. The sample clock is Tuesday 2:30 PM, so the 2:45 PM dentist reminder appears.
cd /d "%~dp0"
set "EXPO_PUBLIC_HOMETIDE_SAMPLE=1"
echo Starting the TV app with the sample family. Open http://localhost:8082 when it says "Web is waiting".
call npx.cmd -y corepack@0.34.0 yarn dev:web
pause
