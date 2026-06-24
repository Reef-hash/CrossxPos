@echo off
REM CrossxPos APK Build Script for Development
REM This script builds and increments version automatically

cd /d "%~dp0"

echo.
echo ============================================
echo CrossxPos APK Build Script
echo ============================================
echo.

REM Check Java version (must be 17+)
echo [0/5] Checking Java version...
java -version 2>&1 | findstr "11\." >nul
if not errorlevel 1 (
    echo ERROR: Java 11 detected. Android Gradle requires Java 17 or higher!
    echo Download from: https://adoptium.net/temurin/releases/?version=21
    echo.
    pause
    exit /b 1
)

REM Step 1: Clean previous builds
echo [1/5] Building web assets...
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build web assets
    exit /b 1
)

echo [2/5] Updating Capacitor...
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Failed to sync Capacitor
    exit /b 1
)

REM Step 2: Increment version code
echo [3/5] Incrementing versionCode...
python android\increment-version.py
if errorlevel 1 (
    echo WARNING: Failed to increment version (Python not found or other error)
    echo Continuing anyway...
)

REM Step 3: Build APK (debug build)
echo [4/5] Building APK (Debug)...
cd android
gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Failed to build APK
    cd ..
    exit /b 1
)
cd ..

REM Step 4: Success message
echo.
echo [5/5] Build complete!
echo.
echo APK location:
echo %cd%\android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo Ready to install on device!
echo.
pause
