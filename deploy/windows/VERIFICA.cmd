@echo off
rem EssentiaMES - diagnostica dell'installazione
rem Doppio clic: chiede i privilegi di amministratore e avvia verifica.ps1.
rem Da riga di comando i parametri vengono passati allo script (vedi README.md).
net session >nul 2>&1
if errorlevel 1 (
  echo Servono i privilegi di amministratore: confermare la richiesta di Windows...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verifica.ps1" %*
set ESITO=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %ESITO%
