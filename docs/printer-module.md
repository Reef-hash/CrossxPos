# Printer Module — Architecture & Reference

> **Status**: Complete (needs APK build for native Bluetooth)  
> **Last updated**: 2026-06-24

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    React / Capacitor                     │
│                                                          │
│  CashierPage                  KitchenPage                │
│  ├─ handleKOT()               (auto-print on new order)  │
│  │   └─ printKOTForOrder()                               │
│  └─ handlePayment()                                      │
│      └─ printReceiptForOrder()                           │
│                │                                         │
│                ▼                                         │
│         PrinterService (singleton)                       │
│         ├─ formatReceipt() → EscPosBuilder               │
│         ├─ formatKOT()     → EscPosBuilder               │
│         └─ route to connection                           │
│                │                                         │
│     ┌──────────┼──────────┐                              │
│     ▼          ▼          ▼                              │
│  Network   Bluetooth     USB                             │
│  Printer   Printer      Printer                          │
│  (TCP)     (SPP)       (OTG)                             │
│     │          │          │                              │
│     ▼          ▼          ▼                              │
│  print-    Capacitor   Capacitor                         │
│  bridge   Plugin       Plugin                            │
│  (HTTP)   (Java)       (Java)                            │
│     │          │          │                              │
└─────┼──────────┼──────────┼──────────────────────────────┘
      │          │          │
      ▼          ▼          ▼
  ┌────────────────────────────────┐
  │     Physical Printers          │
  │  LAN/WiFi  │  Bluetooth  │ USB │
  │  Port 9100 │  SPP        │ OTG │
  └────────────────────────────────┘
```

## 2. File Structure

```
src/
├── lib/
│   └── escpos.ts                    # ESC/POS command builder (pure JS)
├── services/printer/
│   ├── PrinterService.ts            # Singleton orchestrator
│   ├── usePrinterStore.ts           # Zustand persisted config store
│   └── connections/
│       ├── BaseConnection.ts        # IPrinterConnection interface
│       ├── NetworkPrinter.ts        # TCP via print-bridge (HTTP POST)
│       ├── BluetoothPrinter.ts      # SPP via Capacitor plugin (stub)
│       └── BluetoothScanner.ts     # TS bridge for native scanner plugin
├── pages/
│   ├── settings/
│   │   ├── SettingsPage.tsx         # HUB with "Printers" card in Hardware
│   │   └── PrinterSettings.tsx      # Full printer management UI
│   └── cashier/
│       └── CashierPage.tsx          # handleKOT + handlePayment → print
├── types/
│   └── index.ts                     # PrinterConfig, PrinterProfile, StationPrinterMap
└── store/
    └── settingsStore.ts             # kitchenStations drives printer station mapping

scripts/
└── print-bridge.mjs                 # Local HTTP→TCP bridge for LAN printers

android/
└── app/src/main/
    ├── AndroidManifest.xml          # Bluetooth permissions added
    └── java/com/crossxpos/app/
        ├── MainActivity.java        # Registers BluetoothScannerPlugin
        └── plugins/
            └── BluetoothScannerPlugin.java  # Native BT discovery + connect
```

## 3. Types

```typescript
// src/types/index.ts

type PrinterConnectionType = 'bluetooth' | 'network' | 'usb'

interface PrinterConfig {
  id: string
  name: string
  type: PrinterConnectionType
  ipAddress?: string        // network
  port?: number              // default 9100
  macAddress?: string        // bluetooth
  deviceId?: string          // usb
  isActive: boolean
  paperWidth?: number        // 58 or 80
  supportsCutter?: boolean
  supportsDrawer?: boolean
}

interface PrinterProfile {
  id: string
  name: string
  printerId: string
  station?: string           // kitchen station name
  copies: number
  autoCut: boolean
  openDrawer: boolean
}

interface StationPrinterMap {
  station: string            // e.g. 'Kitchen', 'Bar'
  printerId: string
  profileId?: string
}
```

## 4. ESC/POS Builder (`src/lib/escpos.ts`)

Pure TypeScript — no npm dependencies. Builds byte arrays for thermal printers.

### Key API

| Method | Purpose |
|--------|---------|
| `new EscPosBuilder(paperWidth)` | Create builder (58mm / 80mm) |
| `.text(str)` / `.textLine(str)` | Text with auto word-wrap |
| `.boldLine(str)` / `.doubleLine(str)` | Bold / double-height text |
| `.left()` / `.center()` / `.right()` | Alignment |
| `.centered(str)` | Center-aligned text line |
| `.twoColumn(left, right)` | Two-column layout |
| `.itemLine(qty, name, price)` | Item line with dot leaders |
| `.divider(char?)` | Horizontal divider |
| `.blank(n?)` | Empty lines |
| `.barcode(data)` | Barcode (CODE128) |
| `.feed(n?)` / `.cut(partial?)` | Feed lines / cutter |
| `.kickDrawer()` | Cash drawer pulse |
| `.toBytes()` → `Uint8Array` | Raw bytes for transport |
| `.toBase64()` → `string` | Base64 for HTTP/JSON |

### Receipt Templates

```typescript
buildReceipt(data: ReceiptData): EscPosBuilder
// Produces: header → order info → items → totals → payment → footer → cut

buildKOT(data: KOTData): EscPosBuilder
// Produces: station header (double-strike) → items → timestamp → cut
```

## 5. Connection Layer

### 5.1 Network Printer (`NetworkPrinter.ts`)

```
Browser → HTTP POST localhost:6100/print → print-bridge.mjs → TCP printer:9100
```

- Uses the existing `scripts/print-bridge.mjs`
- Bridge must be running: `npm run bridge`
- Only works when bridge + printer are on same LAN
- Port default: 9100 (standard thermal printer TCP port)

### 5.2 Bluetooth Printer (`BluetoothPrinter.ts`)

```
WebView → Capacitor bridge → BluetoothScannerPlugin.java → Android BluetoothAdapter
```

- Native plugin handles `BluetoothSocket` (SPP)
- Plugin stub ready — needs APK build to activate
- MAC address auto-filled by scan feature

### 5.3 USB Printer

```
Slot reserved — not yet implemented.
Needs Android USB Host API via Capacitor plugin.
```

## 6. PrinterService

Singleton accessed via `printerService` or `PrinterService.getInstance()`.

```typescript
printerService.printReceipt(config: PrinterConfig, data: ReceiptData): Promise<void>
printerService.printKOT(config: PrinterConfig, data: KOTData): Promise<void>
printerService.openCashDrawer(config: PrinterConfig): Promise<void>
printerService.testPrint(config: PrinterConfig): Promise<void>
printerService.disconnectAll(): Promise<void>
```

Connections are cached per printer ID and auto-reconnect if disconnected.

## 7. usePrinterStore (Zustand)

Persisted to `localStorage` via Zustand `persist` middleware.

| State | Purpose |
|-------|---------|
| `printers[]` | All configured printer devices |
| `profiles[]` | Per-printer profiles (copies, cutter, drawer) |
| `receiptPrinterId` | Which printer prints customer receipts |
| `stationPrinters[]` | Kitchen station → printer mapping |
| `printerStatus{}` | Runtime online/offline per printer |

Key actions: `addPrinter`, `updatePrinter`, `removePrinter`, `setReceiptPrinter`, `setStationPrinter`, `testPrinter`

## 8. CashierPage Integration

### handleKOT (Send to Kitchen)
```typescript
const handleKOT = async () => {
  const order = activeOrder        // capture before cleared
  await sendToKitchen()
  await printKOTForOrder(order)    // non-blocking — failure is logged, not thrown
  navigate('/orders')
}
```

`printKOTForOrder`:
1. Groups order items by `kitchenStation` (falls back to `'Kitchen'`)
2. For each station with a mapped printer → `printerService.printKOT()`

### handlePayment
```typescript
const handlePayment = async (method) => {
  const completedOrder = await processPayment(method, paid, taxRate)
  await printReceiptForOrder(completedOrder, method, paid)
  // ...cleanup
}
```

## 9. Native Android Plugin

### BluetoothScannerPlugin.java

| Method | Purpose |
|--------|---------|
| `scan()` | Starts 12-second Bluetooth discovery |
| `getPairedDevices()` | Returns already-bonded devices |
| `onDeviceFound` | Live event: each device as it's discovered |

Capacitor bridge via `BluetoothScanner.ts`:
```typescript
const result = await BluetoothScanner.scan()
// result.devices: BluetoothDevice[] (name, address, paired)
```

### Permissions in AndroidManifest.xml
- `BLUETOOTH` / `BLUETOOTH_ADMIN` (classic)
- `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` (Android 12+)
- `ACCESS_FINE_LOCATION` (Android 6–11, maxSdkVersion=30)
- `android.hardware.bluetooth` feature (optional)

## 10. Settings UI — Printer Management

Path: **Settings → Hardware → Printers**

### Features
- Add printer (Network or Bluetooth)
- Network: IP + Port fields
- Bluetooth: MAC address field + **Scan** button → shows discovered devices list
- Set as receipt printer (radio-style toggle)
- Kitchen station mapping (dropdown per printer)
- Test print button (with visual status feedback)
- Delete printer
- Print-bridge usage note at bottom

## 11. Build & Deploy

### Dev (browser)
```bash
npm run dev          # Start Vite dev server
npm run bridge       # Start print-bridge (for network printers)
```

### APK Build (for tablet)
```bash
npm run build                          # Build web assets
npx cap sync android                   # Sync web + plugins to Android
cd android && ./gradlew assembleDebug  # Build debug APK
# Install android/app/build/outputs/apk/debug/app-debug.apk on tablet
```

After APK install: Bluetooth scan/print will work via the native Java plugin.

## 12. Remaining / Future Work

| Item | Priority | Notes |
|------|----------|-------|
| **Build & test APK** | 🔴 High | Verifies BluetoothScannerPlugin works end-to-end |
| **BluetoothPrinter connect/write** | 🔴 High | The connect/write path in the Java plugin needs completion |
| **Network direct TCP** | 🟡 Medium | Skip bridge — use Capacitor TCP socket for tablet→printer direct |
| **USB (OTG) support** | 🟢 Low | Android USB Host API plugin |
| **KitchenPage auto-print** | 🟢 Low | Auto-print KOT when new orders arrive on kitchen display |
| **Print queue / retry** | 🟢 Low | Queue failed prints, retry on reconnect |
| **Logo/image printing** | 🟢 Low | Raster image support in ESC/POS builder |
