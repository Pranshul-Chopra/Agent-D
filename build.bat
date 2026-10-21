@echo off
rem PM Tool - Release Build Script
rem Run this from the repository root (where main.py lives).
rem Requires: Python 3.11/3.13, Node.js, npm

setlocal enabledelayedexpansion

echo.
echo ========================================
echo  PM Tool Build
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

rem Step 1: Activate Python venv if present
echo [1/4] Checking Python environment...
if exist "venv311\Scripts\activate.bat" (
    call venv311\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) else (
    echo Note: No local virtual environment found, using system Python...
)

rem Step 2: Build Vite React SPA frontend
echo [2/4] Building Vite React SPA frontend...
pushd "%SCRIPT_DIR%electron"
call npm run build:ui
if errorlevel 1 (
    echo ERROR: Vite React SPA build failed.
    popd
    exit /b 1
)
popd

rem Step 3: Build Flask backend with PyInstaller
echo [3/4] Building Flask backend with PyInstaller...
if exist flask-dist rmdir /s /q flask-dist
if exist dist\flask rmdir /s /q dist\flask
python -m PyInstaller flask.spec --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    exit /b 1
)
echo Flask backend built -^> dist\flask\

rem Step 3: Install Electron dependencies
echo [3/4] Installing Electron dependencies...
pushd "%SCRIPT_DIR%electron"
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    popd
    exit /b 1
)

rem Step 4: Package with electron-builder
echo [4/4] Packaging desktop application with electron-builder...
call npm run build
if errorlevel 1 (
    echo ERROR: electron-builder failed.
    popd
    exit /b 1
)
popd

echo.
echo ========================================
echo  Build complete!
echo  Output: release\
echo ========================================
echo.
