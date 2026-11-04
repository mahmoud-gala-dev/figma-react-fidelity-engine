@echo off
title Figma Fidelity Audit
echo ====================================================
echo  Running Full Property and Visual Audit...
echo ====================================================
cd /d "%~dp0"
call npm.cmd run audit:full
pause

