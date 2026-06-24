/**
 * Printer Service
 *
 * Orchestrator that:
 * 1. Takes high-level print requests (receipt, KOT, drawer kick)
 * 2. Looks up printer configuration from the store
 * 3. Formats data using ESC/POS builder
 * 4. Routes to the correct connection (Network / Bluetooth)
 */

import type { IPrinterConnection } from './connections/BaseConnection'
import { NetworkPrinterConnection } from './connections/NetworkPrinter'
import { BluetoothPrinterConnection } from './connections/BluetoothPrinter'
import {
  type ReceiptData,
  type KOTData,
  buildReceipt,
  buildKOT,
  buildDrawerKick,
  builderToBase64,
  EscPosBuilder,
} from '@/lib/escpos'
import type { PrinterConfig } from '@/types'

/**
 * Create the right connection for a printer config.
 * Throws if the config is invalid or unsupported.
 */
function createConnection(config: PrinterConfig): IPrinterConnection {
  switch (config.type) {
    case 'network':
      if (!config.ipAddress) throw new Error(`Network printer "${config.name}" missing ipAddress`)
      return new NetworkPrinterConnection(config.ipAddress, config.port ?? 9100)

    case 'bluetooth':
      if (!config.macAddress) throw new Error(`Bluetooth printer "${config.name}" missing macAddress`)
      return new BluetoothPrinterConnection(config.macAddress)

    case 'usb':
      throw new Error(`USB printing not yet implemented for "${config.name}"`)

    default:
      throw new Error(`Unknown printer type for "${config.name}"`)
  }
}

export class PrinterService {
  private connections = new Map<string, IPrinterConnection>()

  /**
   * Get or create a persistent connection for a printer.
   */
  private async getConnection(config: PrinterConfig): Promise<IPrinterConnection> {
    let conn = this.connections.get(config.id)
    if (!conn) {
      conn = createConnection(config)
      this.connections.set(config.id, conn)
    }
    if (!conn.isConnected()) {
      await conn.connect()
    }
    return conn
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /**
   * Print a customer receipt.
   * @param config - The printer to use
   * @param data  - Receipt data (items, totals, payment)
   */
  async printReceipt(config: PrinterConfig, data: ReceiptData): Promise<void> {
    const conn = await this.getConnection(config)
    const builder = buildReceipt(data)
    await conn.write(builder.toBytes())
    console.log(`[PrinterService] Receipt #${data.orderNumber} → ${config.name}`)
  }

  /**
   * Print a Kitchen Order Ticket for one station.
   * @param config - The printer for this station
   * @param data   - KOT data (items filtered to this station)
   */
  async printKOT(config: PrinterConfig, data: KOTData): Promise<void> {
    const conn = await this.getConnection(config)
    const builder = buildKOT(data)
    await conn.write(builder.toBytes())
    console.log(`[PrinterService] KOT #${data.orderNumber} [${data.station}] → ${config.name}`)
  }

  /**
   * Open the cash drawer connected to a printer.
   * Most thermal printers have an RJ12 port for a cash drawer.
   */
  async openCashDrawer(config: PrinterConfig): Promise<void> {
    const conn = await this.getConnection(config)
    const builder = buildDrawerKick()
    await conn.write(builder.toBytes())
    console.log(`[PrinterService] Cash drawer kick → ${config.name}`)
  }

  /**
   * Close all open connections.
   * Call this on app shutdown or printer config change.
   */
  async disconnectAll(): Promise<void> {
    for (const [id, conn] of this.connections) {
      try {
        await conn.disconnect()
      } catch {
        // Best effort
      }
      this.connections.delete(id)
    }
  }

  /**
   * Test connectivity to a printer by sending a minimal test print.
   */
  async testPrint(config: PrinterConfig): Promise<void> {
    const p = new EscPosBuilder(config.paperWidth as 58 | 80 ?? 58)
    p.center()
    p.doubleLine(config.name)
    p.centered('Test Print OK')
    p.centered(new Date().toLocaleString())
    p.feed(3)
    p.cut()

    const conn = await this.getConnection(config)
    await conn.write(p.toBytes())
    console.log(`[PrinterService] Test print → ${config.name}`)
  }

  // ─── Singleton ────────────────────────────────────────────────────────

  private static instance: PrinterService
  static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService()
    }
    return PrinterService.instance
  }
}

export const printerService = PrinterService.getInstance()
