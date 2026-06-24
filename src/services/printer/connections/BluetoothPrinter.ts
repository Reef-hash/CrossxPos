/**
 * Bluetooth Printer Connection (Capacitor)
 *
 * Uses Bluetooth Serial (SPP) to communicate with thermal printers.
 * Most Bluetooth receipt printers use SPP (Serial Port Profile).
 *
 * IMPLEMENTATION PATH:
 *   We need a Capacitor plugin for Bluetooth SPP. Options:
 *
 *   1. @capacitor-community/bluetooth-le
 *      - Focused on BLE, not SPP — may not work with most receipt printers
 *
 *   2. Custom Capacitor plugin using Android's BluetoothSocket API
 *      - Recommended approach
 *      - Create: android/app/src/main/java/com/crossxpos/app/BluetoothPrinterPlugin.java
 *      - Register in MainActivity
 *
 *   3. Use Web Bluetooth API
 *      - Chrome-only, limited support in Android WebView
 *
 * FOR NOW: This is a stub. The actual Bluetooth connection uses Capacitor's
 * plugin bridge. We'll implement the native Android side separately.
 *
 * Usage (once plugin is ready):
 *   const bt = new BluetoothPrinterConnection('00:11:22:33:44:55')
 *   await bt.connect()
 *   await bt.write(escPosBytes)
 *   await bt.disconnect()
 */

import type { IPrinterConnection } from './BaseConnection'

declare global {
  interface Window {
    CapacitorCustomPlugins?: {
      BluetoothPrinter?: {
        connect: (options: { address: string }) => Promise<{ connected: boolean }>
        disconnect: (options: { address: string }) => Promise<void>
        write: (options: { address: string; data: string }) => Promise<void>
        isConnected: (options: { address: string }) => Promise<{ connected: boolean }>
      }
    }
  }
}

export class BluetoothPrinterConnection implements IPrinterConnection {
  private macAddress: string
  private _connected = false

  constructor(macAddress: string) {
    this.macAddress = macAddress
  }

  async connect(): Promise<void> {
    const plugin = window.CapacitorCustomPlugins?.BluetoothPrinter
    if (!plugin) {
      throw new Error(
        'BluetoothPrinter plugin not found. ' +
        'Install the native Capacitor plugin for Bluetooth thermal printing.'
      )
    }

    try {
      const result = await plugin.connect({ address: this.macAddress })
      this._connected = result.connected
      console.log(`[BluetoothPrinter] Connected to ${this.macAddress}`)
    } catch (err) {
      this._connected = false
      throw new Error(`Bluetooth connection failed: ${err}`)
    }
  }

  async disconnect(): Promise<void> {
    const plugin = window.CapacitorCustomPlugins?.BluetoothPrinter
    if (plugin) {
      try {
        await plugin.disconnect({ address: this.macAddress })
      } catch {
        // Ignore disconnect errors
      }
    }
    this._connected = false
  }

  async write(data: Uint8Array): Promise<void> {
    const plugin = window.CapacitorCustomPlugins?.BluetoothPrinter
    if (!plugin) {
      throw new Error('BluetoothPrinter plugin not available')
    }

    if (!this._connected) {
      await this.connect()
    }

    // Encode bytes to base64 for plugin transport
    const base64Data = btoa(String.fromCharCode(...data))
    await plugin.write({ address: this.macAddress, data: base64Data })
    console.log(`[BluetoothPrinter] Sent ${data.length} bytes → ${this.macAddress}`)
  }

  isConnected(): boolean {
    return this._connected
  }
}
