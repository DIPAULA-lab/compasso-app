@echo off
rem Dois cliques para desligar e remover o Compasso neste Windows. Os dados (Compasso\dados) nunca sao apagados.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\compasso-windows.ps1" desinstalar
echo.
pause
