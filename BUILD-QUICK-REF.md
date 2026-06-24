# CrossxPos Build Quick Reference

**Supported:** Android 5.0+ (Budget tablets & older devices)

## Fastest Way to Build & Install

```bash
# 1. Build APK
cd CrossxPos
build.bat          # Windows
./build.sh        # macOS/Linux

# 2. Install on tablet (connected via USB with ADB)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## One-Liner (Windows PowerShell)

```powershell
cd CrossxPos; npm run build; npx cap sync android; cd android; .\gradlew.bat assembleDebug; cd ..; adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Check Prerequisites

```bash
# Java
java -version

# Android SDK
adb devices    # List connected devices

# Gradle
cd CrossxPos/android
gradlew.bat -v  # or ./gradlew -v
```

## Version Management

```bash
# Auto-increment (done by build script)
python android/increment-version.py

# Manual: Edit file
android/version.properties
```

## ADB Commands

```bash
# Check devices
adb devices

# Install app
adb install -r app-debug.apk

# Uninstall app
adb uninstall com.crossxpos.app.debug

# Launch app
adb shell am start -n com.crossxpos.app.debug/com.crossxpos.app.MainActivity

# View logs
adb logcat

# Clear app cache
adb shell pm clear com.crossxpos.app.debug
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| INSTALL_FAILED_VERSION_DOWNGRADE | versionCode too low | Increment version or uninstall first |
| INSTALL_FAILED_INCOMPATIBLE | API level mismatch | Check tablet Android version |
| INSTALL_FAILED_INVALID_APK | APK corrupted | Rebuild with `gradlew clean` |
| No devices found | USB connection issue | Enable USB Debug, reconnect, `adb devices` |

## Directory Structure

```
CrossxPos/
├── build.bat              ← Build script (Windows)
├── build.sh               ← Build script (macOS/Linux)
├── BUILD-GUIDE.md         ← Full documentation
├── android/
│   ├── version.properties ← Version tracking
│   ├── app/
│   │   └── build.gradle   ← Build config (auto-reads version)
│   └── gradlew.bat
└── src/
    └── (React app)
```

---

**Need help?** See `BUILD-GUIDE.md` for detailed instructions.
