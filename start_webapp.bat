@echo off
start "ComfyUI Web" cmd /k "cd /d "%~dp0comfy-web" && call npm run dev"
timeout /t 3 /nobreak >nul
echo Web UI started
