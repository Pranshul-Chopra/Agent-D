@echo off
rem Agent-D - Desktop Production Release Build Script
rem Run from repository root.
rem Requires: Python 3.11+, Node.js 20+, npm

echo.
echo ========================================================
echo   Agent-D Desktop Production Release Builder v0.4.0
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

rem Avoid electron-builder hanging on developer certificate discovery
if "%CSC_IDENTITY_AUTO_DISCOVERY%"=="" set "CSC_IDENTITY_AUTO_DISCOVERY=false"

rem Step 1: Detect and Activate Python Environment
echo [1/5] Checking Python environment...
if exist "venv311\Scripts\pyinstaller.exe" (
    echo Activating venv311...
    call venv311\Scripts\activate.bat
    goto PYTHON_READY
)
if exist "venv\Scripts\pyinstaller.exe" (
    echo Activating venv...
    call venv\Scripts\activate.bat
    goto PYTHON_READY
)
if exist ".venv\Scripts\pyinstaller.exe" (
    echo Activating .venv...
    call .venv\Scripts\activate.bat
    goto PYTHON_READY
)
echo Note: Using system Python...

:PYTHON_READY
python --version
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    exit /b 1
)

rem Step 2: Build Vite React SPA frontend
echo.
echo [2/5] Building React SPA with Vite...
pushd "%SCRIPT_DIR%electron"
call npm run build:ui
if errorlevel 1 (
    echo ERROR: Vite React SPA build failed.
    popd
    exit /b 1
)
popd
echo Frontend built successfully into static/spa/

rem Step 3: Package Flask backend with PyInstaller
echo.
echo [3/5] Freezing Flask backend with PyInstaller...
set "SKIP_PY=0"
if "%~1"=="--skip-pyinstaller" set "SKIP_PY=1"
if "%~2"=="--skip-pyinstaller" set "SKIP_PY=1"

if "%SKIP_PY%"=="1" (
    if exist "dist\flask\flask.exe" (
        echo Skipping PyInstaller build - using existing dist\flask\
        echo Syncing updated static\spa into dist\flask\_internal\static\spa...
        xcopy /s /e /y /i "static\spa" "dist\flask\_internal\static\spa" >nul
        goto PYINSTALLER_DONE
    )
    echo Warning: dist\flask\flask.exe not found, proceeding with PyInstaller build...
)

if exist "dist\flask" rmdir /s /q "dist\flask"
if exist "build\flask" rmdir /s /q "build\flask"
python -m PyInstaller flask.spec --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    exit /b 1
)
echo Flask backend successfully frozen to dist\flask\
goto PYINSTALLER_DONE

:PYINSTALLER_DONE

rem Step 4: Ensure Electron dependencies are installed
echo.
echo [4/5] Verifying Electron dependencies...
pushd "%SCRIPT_DIR%electron"
if not exist "node_modules" (
    echo Installing npm dependencies in electron...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed.
        popd
        exit /b 1
    )
)

rem Step 5: Package Desktop Application with electron-builder
echo.
echo [5/5] Packaging Windows executable and installer with electron-builder...
if "%~1"=="--dir" goto BUILD_DIR
if "%~2"=="--dir" goto BUILD_DIR

call npm run build
if errorlevel 1 (
    echo ERROR: electron-builder packaging failed.
    popd
    exit /b 1
)
goto BUILD_DONE

:BUILD_DIR
call npm run build:dir
if errorlevel 1 (
    echo ERROR: electron-builder packaging failed.
    popd
    exit /b 1
)

:BUILD_DONE
popd

echo.
echo ========================================================
echo   Agent-D Build Completed Successfully!
echo   Installer and Executables: release\
echo ========================================================
echo.
