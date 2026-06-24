/**
 * Capacitor BluetoothScanner Plugin — TypeScript Bridge
 *
 * Talks to the native Android BluetoothScannerPlugin.java.
 * Provides scan() for discovering nearby Bluetooth printers (SPP/classic).
 */

import { registerPlugin } from '@capacitor/core'

export interface BluetoothDevice {
  name: string
  address: string    // MAC address
  paired: boolean
}

export interface BluetoothScannerPlugin {
  /** Start scanning for nearby Bluetooth devices (12-second discovery) */
  scan(): Promise<{ devices: BluetoothDevice[] }>
  /** Get already-paired Bluetooth devices */
  getPairedDevices(): Promise<{ devices: BluetoothDevice[] }>
  /** Listen for live device discovery events */
  addListener(
    eventName: 'onDeviceFound',
    listener: (event: { type: string; device?: BluetoothDevice }) => void
  ): Promise<{ remove: () => void }>
}

const BluetoothScanner = registerPlugin<BluetoothScannerPlugin>('BluetoothScanner')

export default BluetoothScanner
