@echo off
rem Dois cliques para instalar (ou atualizar) o Compasso neste Windows. Os dados (Compasso\dados) nunca sao apagados.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\compasso-windows.ps1" instalar
echo.
pause
