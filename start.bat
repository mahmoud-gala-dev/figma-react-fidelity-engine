@echo off
title Figma Fidelity MVP Dev Server
echo ====================================================
echo  Starting Figma Fidelity Client MVP Server...
echo ====================================================
cd /d "%~dp0"
start http://127.0.0.1:5173/
call npm.cmd run dev
pause

