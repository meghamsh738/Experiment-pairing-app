@echo off
setlocal
set "WSL_PATH='<PROJECTS_DIR>/Experiment-pairing-app/modern-app'"
start "Experiment pairing servers" wsl -e bash -lc "cd %WSL_PATH% && npm run dev:full"
timeout /t 4 >nul
start "" http://localhost:5173
endlocal
