@echo off
REM Sube una carpeta de videos a un curso. Convierte a H.264.
REM Uso: doble click y editar SOURCE_DIR y SLUG abajo, o pasar como args.

set SOURCE_DIR=C:\Users\juanm\Downloads\Photos-3-001
set SLUG=flores-nepal

if not "%~1"=="" set SOURCE_DIR=%~1
if not "%~2"=="" set SLUG=%~2

cd /d "%~dp0"
node scripts\UPLOAD_BATCH.mjs "%SOURCE_DIR%" %SLUG%
echo.
echo ===========================================
echo  Upload batch terminado. Log en scripts\_logs\
echo ===========================================
pause
