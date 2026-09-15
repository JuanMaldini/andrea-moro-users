@echo off
REM Doble click = SIMULACION (no cambia nada). Para aplicar: CONVERT_VIDEOS.bat --apply
REM Requiere ffmpeg en PATH (winget install -e --id Gyan.FFmpeg).

cd /d "%~dp0"
node scripts\CONVERT_VIDEOS.mjs %*
echo.
echo ===========================================
echo  Proceso terminado. Log en scripts\_logs\
echo ===========================================
pause
