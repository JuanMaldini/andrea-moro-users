@echo off
REM Ejecuta el script de conversion de videos.
REM Requiere ffmpeg + ffprobe en PATH.

cd /d "%~dp0"
node scripts\CONVERT_VIDEOS.mjs
if errorlevel 1 (
  echo.
  echo *** Hubo errores. Revisa el log de arriba. ***
  pause
)
