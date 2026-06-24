# APK Build & Installation Guide - Development

Panduan lengkap untuk build dan install CrossxPOS APK di tablet untuk development.

## Penyebab Error "Invalid Package" dan Solusinya

### ❌ Masalah Umum:
1. **versionCode tidak increment** → Android menolak instalasi versi lama
2. **APK signing tidak konsisten** → Keystore berbeda setiap build
3. **API level tidak kompatibel** → Tablet lebih rendah dari minSdkVersion

### ✅ Solusi yang Sudah Diimplementasikan:
- ✓ Auto-increment versionCode (setiap build: 3 → 4 → 5 dst)
- ✓ Debug keystore configuration yang proper
- ✓ Build script otomatis dengan error checking
- ✓ Version management system

---

## Prerequisites

1. **Android SDK** installed (API 21+ supported for budget tablets)
2. **Java 17 or higher** installed ⚠️ (Java 11 tidak support untuk Android Gradle plugin)
   - Recommended: Java 21 LTS
   - Download: https://adoptium.net/temurin/releases/?version=21
3. **Git Bash** atau **Command Prompt** di Windows
4. **Python 3** (opsional, untuk version increment otomatis)

### Supported Android Versions:
- ✅ **Android 5.0+ (API 21+)** - Budget tablets & older devices
- ✅ **Android 15 (API 36)** - Latest devices

### Check Prerequisites:
```bash
# Check Java - MUST be 17+
java -version

# Check Android SDK location
echo %ANDROID_HOME%
```

---

## Build Steps - Cara Termudah

### Option 1: Gunakan Build Script (Recommended)

**Windows:**
```bash
cd CrossxPos
build.bat
```

**macOS/Linux:**
```bash
cd CrossxPos
chmod +x build.sh
./build.sh
```

**Apa yang dilakukan:**
1. Build web assets (React/Vite)
2. Sync dengan Capacitor
3. Auto-increment versionCode
4. Build APK debug
5. Output APK ready to install

---

### Option 2: Manual Build (Step-by-Step)

1. **Build web assets:**
   ```bash
   cd CrossxPos
   npm install  # hanya pertama kali
   npm run build
   ```

2. **Sync Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Manual increment version (opsional):**
   ```bash
   python android/increment-version.py
   ```
   Atau edit `android/version.properties`:
   ```properties
   versionCode=5        # increment number ini
   versionName=1.1
   ```

4. **Build APK:**
   ```bash
   cd CrossxPos/android
   ./gradlew.bat assembleDebug
   ```

---

## Install ke Tablet

### Menggunakan ADB (Recommended)

1. **Enable USB Debugging di tablet:**
   - Settings → Developer Options → USB Debugging (ON)
   - Hubungkan tablet ke laptop via USB

2. **Verify connection:**
   ```bash
   adb devices
   ```
   Output harus:
   ```
   List of attached devices
   ABC123XYZ          device
   ```

3. **Install APK:**
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
   
   Flag `-r` = reinstall (uninstall versi lama dulu)

4. **Launch app:**
   ```bash
   adb shell am start -n com.crossxpos.app.debug/com.crossxpos.app.MainActivity
   ```

### Menggunakan File Manager

1. Copy file APK ke tablet (bisa via email, Cloud, USB)
2. Buka file manager di tablet
3. Tap file APK → Install
4. Allow installation dari Unknown Sources (jika diminta)

---

## Version Management

### File: `android/version.properties`

```properties
versionCode=3      # Angka increment (harus ≥ previous version)
versionName=1.1    # Human-readable version string
```

### Kapan Increment?
- Setiap build ulang di tablet yang sama = HARUS increment
- Uninstall app dulu = bisa pakai versionCode sama

### Auto-Increment
Build script otomatis increment versionCode. Jika ingin manual:

```bash
# Edit file
android/version.properties
versionCode=4  # ganti angka
```

---

## Troubleshooting

### Error: "java.lang.NullPointerException: key not found: versionCode"
**Solusi:**
```bash
# Pastikan version.properties ada
dir android/version.properties

# Jika tidak ada, buat manual:
# Isi: versionCode=3
#      versionName=1.1
```

### Error: "INSTALL_FAILED_VERSION_DOWNGRADE"
**Penyebab:** versionCode lebih rendah dari installed version
**Solusi:**
```bash
# Uninstall app dulu
adb uninstall com.crossxpos.app.debug

# Atau increment version
python android/increment-version.py
```

### Error: "INSTALL_FAILED_INCOMPATIBLE"
**Penyebab:** Tablet API level lebih rendah dari minSdkVersion (21 = Android 5.0)
**Solusi:** 
- Tablet harus Android 5.0 (API 21) atau lebih tinggi
- Untuk tablet lebih lama, update Android version jika possible
- Atau ubah `minSdkVersion` di `android/variables.gradle` jika ada compatibility issue

### Build Failed: Gradle Error
```bash
# Clean build
cd CrossxPos/android
./gradlew.bat clean
./gradlew.bat assembleDebug
```

### Error: "Android Gradle plugin requires Java 17 to run"
**Penyebab:** Java version terlalu rendah (Java 11, Android Gradle butuh 17+)
**Solusi:**
1. Download & install Java 21: https://adoptium.net/temurin/releases/?version=21
2. Set JAVA_HOME ke path Java baru
3. Retry build

**Verify Java version:**
```bash
java -version  # Must show 17 or higher
```

---

## Development Workflow

1. **Development:**
   ```bash
   npm run dev  # Hot reload web
   ```

2. **Ready to test di tablet:**
   ```bash
   build.bat  # atau ./build.sh
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Uninstall (clean test):**
   ```bash
   adb uninstall com.crossxpos.app.debug
   ```

---

## Production Release (Nanti)

Saat ready untuk production:

1. Create keystore:
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure signing di `android/app/build.gradle`

3. Update version dan sign dengan keystore

Untuk sekarang, gunakan debug builds saja.

---

## Tips

- 🔄 Refresh NPM modules: `npm install --force`
- 🔧 Update Capacitor: `npm install @capacitor/cli@latest`
- 📝 Check logs: `adb logcat` (real-time app logs)
- 🗑️ Clear app data: `adb shell pm clear com.crossxpos.app.debug`

---

**Last Updated:** 2026-06-16
**Status:** Development Build Setup Complete ✓
