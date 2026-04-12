@echo off
echo Starting ComfyUI and Web UI...

start "ComfyUI" cmd /k "cd /d "%~dp0ComfyUI" && call "%~dp0ComfyUI\venv\Scripts\python.exe" main.py"
timeout /t 3 /nobreak >nul
start "ComfyUI Web" cmd /k "cd /d "%~dp0comfy-web" && call npm run dev"

echo Both services starting...
echo ComfyUI: http://127.0.0.1:8188
echo Web UI: http://localhost:3000
pause