#!/bin/bash
# CrossxPos APK Build Script for Development (macOS/Linux)
# This script builds and increments version automatically

set -e  # Exit on error

cd "$(dirname "$0")"

echo ""
echo "============================================"
echo "CrossxPos APK Build Script"
echo "============================================"
echo ""

# Check Java version (must be 17+)
echo "[0/5] Checking Java version..."
java_version=$(java -version 2>&1 | grep -oP 'version "\K[0-9]+' | head -1)
if [ "$java_version" = "11" ]; then
    echo "ERROR: Java 11 detected. Android Gradle requires Java 17 or higher!"
    echo "Download from: https://adoptium.net/temurin/releases/?version=21"
    exit 1
fi

# Step 1: Build web assets
echo "[1/5] Building web assets..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build web assets"
    exit 1
fi

# Step 2: Sync Capacitor
echo "[2/5] Updating Capacitor..."
npx cap sync android
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to sync Capacitor"
    exit 1
fi

# Step 3: Increment version code
echo "[3/5] Incrementing versionCode..."
if command -v python3 &> /dev/null; then
    python3 android/increment-version.py
    if [ $? -ne 0 ]; then
        echo "WARNING: Failed to increment version"
    fi
else
    echo "WARNING: Python3 not found, skipping auto-increment"
    echo "Please manually edit android/version.properties if needed"
fi

# Step 4: Build APK (debug build)
echo "[4/5] Building APK (Debug)..."
cd android
chmod +x gradlew
./gradlew assembleDebug
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build APK"
    cd ..
    exit 1
fi
cd ..

# Step 5: Success message
echo ""
echo "[5/5] Build complete!"
echo ""
echo "APK location:"
echo "$(pwd)/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "To install on device:"
echo "  adb install -r android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
