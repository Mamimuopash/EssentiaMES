@echo off
rem EssentiaMES - preparazione di SQL Server (da eseguire sul server SQL)
rem Doppio clic: chiede i privilegi di amministratore e avvia prepara-sql-server.ps1.
rem Da riga di comando i parametri vengono passati allo script (vedi README.md).
net session >nul 2>&1
if errorlevel 1 (
  echo Servono i privilegi di amministratore: confermare la richiesta di Windows...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepara-sql-server.ps1" %*
set ESITO=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %ESITO%
