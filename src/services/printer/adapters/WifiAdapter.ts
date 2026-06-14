/**
 * WifiAdapter
 *
 * Communicates with LAN/WiFi thermal printers via TCP/ESC-POS.
 * Uses a local print bridge (http://127.0.0.1:6100/print) to forward raw bytes to the printer.
 */

import type { IPrinterAdapter, PrinterConfig, PrinterStatus, PrinterError } from './IPrinterAdapter';

const BRIDGE_URL = 'http://127.0.0.1:6100/print';
const BRIDGE_TIMEOUT_MS = 8000;

export class WifiAdapter implements IPrinterAdapter {
  readonly type = 'wifi';
  private status: PrinterStatus = 'disconnected';
  private lastError: PrinterError | null = null;
  private config: PrinterConfig | null = null;

  getStatus(): PrinterStatus {
    return this.status;
  }

  getLastError(): PrinterError | null {
    return this.lastError;
  }

  async connect(config: PrinterConfig): Promise<void> {
    try {
      this.status = 'connecting';
      this.lastError = null;

      if (!config.ip) {
        throw new Error('IP address is required for WiFi printer');
      }

      // Store config for later use
      this.config = config;
      this.status = 'ready';
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastError = {
        code: 'WIFI_CONNECT_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      this.status = 'error';
      throw this.lastError;
    }
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.status = 'disconnected';
    this.lastError = null;
  }

  /**
   * Send raw ESC/POS bytes to the printer via the local bridge.
   * The bridge must be running at http://127.0.0.1:6100/print
   */
  async print(data: Uint8Array): Promise<void> {
    try {
      if (!this.config?.ip) {
        throw new Error('Not connected to printer');
      }

      this.status = 'printing';
      const base64Data = this.toBase64(data);

      const response = await fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: this.config.ip,
          port: this.config.port || 9100,
          data: base64Data,
        }),
        signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
      }

      this.status = 'ready';
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastError = {
        code: 'WIFI_PRINT_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      this.status = 'error';
      throw this.lastError;
    }
  }

  /**
   * Encode Uint8Array to base64 without spread (safe for large buffers).
   */
  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
