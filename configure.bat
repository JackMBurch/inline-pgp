@echo off
setlocal enabledelayedexpansion

REM Determine script directory so the script can be run from anywhere
set "SCRIPT_DIR=%~dp0"
set "USERSCRIPT_FILE=%SCRIPT_DIR%userscript.js"

if not exist "%USERSCRIPT_FILE%" (
  echo Error: "userscript.js" not found next to configure.bat.
  exit /b 1
)

findstr /C:"<domain>" "%USERSCRIPT_FILE%" >nul
if errorlevel 1 (
  echo Warning: No "^<domain^>" placeholder found in userscript.js.
  echo Nothing to replace.
  exit /b 0
)

set /p DOMAIN=Enter domain (e.g. example.com):

if "%DOMAIN%"=="" (
  echo Error: Domain cannot be empty.
  exit /b 1
)

REM Use PowerShell to perform the in-place replacement
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(Get-Content '%USERSCRIPT_FILE%') -replace '<domain>', '%DOMAIN%' | Set-Content '%USERSCRIPT_FILE%'"

if errorlevel 1 (
  echo Error: Failed to update userscript.js
  exit /b 1
)

echo Updated userscript.js with domain "%DOMAIN%".

endlocal


