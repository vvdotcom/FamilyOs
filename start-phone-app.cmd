@echo off
rem Starts the Hometide API locally with the rebuilt phone web app, then opens it at http://127.0.0.1:8787/app/
rem Local demo mode: the demo family lives in memory and resets when this window closes.
cd /d "%~dp0"
echo [1/4] Building the phone web app ...
call npx -y corepack@0.34.0 yarn build:web-app
if errorlevel 1 ( echo Building the web app failed. & pause & exit /b 1 )
cd services\family-agent
if not exist .venv\Scripts\python.exe (
  echo [2/4] Creating the Python environment ...
  py -3.11 -m venv .venv 2>nul || py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
echo [3/4] Installing the API's packages (first time only takes a few minutes) ...
python -m pip install -q -e ".[dev]"
if errorlevel 1 ( echo Installing the API failed. & pause & exit /b 1 )
python -m pytest tests/test_tv_settings.py -q
echo [4/4] Starting the API. Leave this window open; close it to stop.
start "" cmd /c "timeout /t 10 >nul & start http://127.0.0.1:8787/app/"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --env-file ..\..\.env
pause
