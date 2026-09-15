@echo off
REM Migración a colecciones v2. Por defecto SIMULA (no escribe nada).
REM Para ejecutar de verdad:  MIGRATE_V2.bat --apply

cd /d "%~dp0"
node scripts\MIGRATE_V2.mjs %*
echo.
echo ===========================================
echo  Proceso terminado. Log en scripts\_logs\
echo ===========================================
pause
