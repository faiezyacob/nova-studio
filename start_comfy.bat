@echo off
start "ComfyUI" cmd /k "cd /d "%~dp0ComfyUI" && call "%~dp0ComfyUI\venv\Scripts\python.exe" main.py"
timeout /t 3 /nobreak >nul
echo ComfyUI started