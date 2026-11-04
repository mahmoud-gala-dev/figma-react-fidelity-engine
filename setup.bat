@echo off
title Setup Figma Fidelity MVP
echo ====================================================
echo  Installing Dependencies and Setting Up Environment
echo ====================================================
cd /d "%~dp0"
call npm.cmd install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo.
echo ====================================================
echo  Installing Playwright Chromium Browser
echo ====================================================
call npx.cmd playwright install chromium
echo.
echo ====================================================
echo  Running Tests Verification
echo ====================================================
call npm.cmd test
echo.
echo ====================================================
echo  Setup Completed Successfully!
echo ====================================================
pause

