/**
 * Network/IP Printer Connection
 *
 * Sends ESC/POS data via the local print-bridge HTTP server.
 * The bridge (scripts/print-bridge.mjs) listens on localhost:6100
 * and forwards raw TCP data to the printer on port 9100.
 *
 * This works for LAN/WiFi thermal printers (e.g., Epson TM-T88, Xprinter, etc.)
 *
 * NOTE: The print-bridge must be running on the same machine as the web app.
 *       Start it with: npm run bridge
 */

import type { IPrinterConnection } from './BaseConnection'

const BRIDGE_URL = 'http://127.0.0.1:6100'

export class NetworkPrinterConnection implements IPrinterConnection {
  private ip: string
  private port: number
  private _connected = false

  constructor(ip: string, port = 9100) {
    this.ip = ip
    this.port = port
  }

  async connect(): Promise<void> {
    // Verify the bridge is reachable
    try {
      const resp = await fetch(`${BRIDGE_URL}/health`)
      if (!resp.ok) throw new Error(`Bridge health check failed: ${resp.status}`)
      const data = await resp.json()
      if (!data.ok) throw new Error('Bridge not healthy')
      this._connected = true
      console.log(`[NetworkPrinter] Connected via bridge → ${this.ip}:${this.port}`)
    } catch (err) {
      this._connected = false
      throw new Error(`Cannot reach print bridge at ${BRIDGE_URL}. Is it running? (npm run bridge)\n${err}`)
    }
  }

  async disconnect(): Promise<void> {
    this._connected = false
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this._connected) {
      await this.connect()
    }

    // Convert bytes to base64 for JSON transport
    const base64Data = btoa(String.fromCharCode(...data))

    const resp = await fetch(`${BRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: this.ip,
        port: this.port,
        data: base64Data,
      }),
    })

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
      throw new Error(`Print failed: ${err.error}`)
    }

    console.log(`[NetworkPrinter] Sent ${data.length} bytes → ${this.ip}:${this.port}`)
  }

  isConnected(): boolean {
    return this._connected
  }
}
