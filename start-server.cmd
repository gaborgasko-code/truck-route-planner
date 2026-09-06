@echo off
REM Truck Route Planner - start the local development server (created by Gabor Gasko)
cd /d "%~dp0"
start "" http://localhost:8080/
node tools\serve.js 8080
