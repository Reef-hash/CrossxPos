# Printer Module Architecture (MVVM)

## Overview
This document outlines the standardisation of the printing module in CrossxPos to support multiple hardware connections (Wi-Fi/LAN, Bluetooth, USB) using an MVVM architecture.

The goal is to remove spaghetti dependencies from UI components (like `CashierPage` and `SettingsPage`) and cleanly separate hardware communication from business logic.

## Architecture Pattern

We use the Model-View-ViewModel (MVVM) pattern combined with the Factory and Adapter design patterns.

### 1. Model (Adapters)
Responsible for raw data transmission and device connectivity.
* **`IPrinterAdapter`**: Interface guaranteeing polymorphism across different hardware types.
* **`WifiAdapter`**: Communicates with LAN/TCP thermal printers (via the local `print-bridge`).
* **`BluetoothAdapter`**: (Future) Communicates with BLE thermal printers via Capacitor Bluetooth plugins.
* **`UsbAdapter`**: (Future) Communicates with USB thermal printers via WebUSB or native plugins.
* **`WebFallbackAdapter`**: Fallback to standard browser `window.print()` behavior.

### 2. Factory
* **`PrinterFactory`**: Instantiates the correct adapter dynamically based on user configuration (`wifi`, `bluetooth`, `usb`, `web`).

### 3. ViewModel (Store & Service)
Responsible for state management and business logic shaping.
* **`usePrinterStore` (Zustand)**: Maintains reactive connection statuses (`disconnected`, `connecting`, `ready`, `error`), tracks the active adapters, and exposes methods for the UI to consume without worrying about the underlying tech.
* **`PrinterService`**: Serves as the central API for formatting Receipts and Kitchen Order Tickets (KOT) into ESC/POS bytes or HTML before passing them to the active Adapter.

### 4. View (UI Components)
React components (`CashierPage`, `SettingsPage`, `ReportsPage`) will:
* Import `usePrinterStore` to read connection statuses or trigger configuration changes.
* Import `PrinterService` to trigger actual printing (e.g., `PrinterService.printReceipt(order)`).

## Implementation Phases

**Phase 1: Setup Architecture & Interfaces**
* Define `IPrinterAdapter.ts`.
* Define `PrinterFactory.ts`.
* Implement `WebFallbackAdapter.ts` as the baseline.

**Phase 2: Migrate WiFi Adapter & Store**
* Implement `WifiAdapter.ts` by migrating `sendViaBridge` from `lib/printer.ts`.
* Create `usePrinterStore.ts` using Zustand to track statuses and active configurations.

**Phase 3: Migrate Business Logic (PrinterService)**
* Create `PrinterService.ts` to manage building `ESC/POS` vs `HTML` and routing payloads to the correct adapter.

**Phase 4: Refactor UI Components**
* Refactor `SettingsPage.tsx` to read/write through `usePrinterStore` instead of raw local component state.
* Refactor `CashierPage.tsx` to fire `PrinterService` methods, removing `lib/printer.ts` direct imports.

**Phase 5: Future Hardware Expansion**
* Scaffold `BluetoothAdapter.ts` and `UsbAdapter.ts` to hook into Capacitor native plugins.
