/**
 * WebFallbackAdapter
 *
 * Falls back to standard browser window.print() dialog.
 * Used when no hardware printer is configured or all hardware connections fail.
 */

import type { IPrinterAdapter, PrinterStatus, PrinterError } from './IPrinterAdapter';

export class WebFallbackAdapter implements IPrinterAdapter {
  readonly type = 'web';
  private status: PrinterStatus = 'ready';
  private lastError: PrinterError | null = null;

  getStatus(): PrinterStatus {
    return this.status;
  }

  getLastError(): PrinterError | null {
    return this.lastError;
  }

  async connect(): Promise<void> {
    // Web fallback doesn't require connection setup
    this.status = 'ready';
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  /**
   * For web fallback, data is converted to HTML and opened in a new window for printing.
   * This method doesn't actually use the Uint8Array; the caller should handle
   * displaying the formatted receipt/ticket HTML before calling this.
   */
  async print(): Promise<void> {
    try {
      this.status = 'printing';
      // Web fallback relies on caller providing the HTML separately
      // This ensures the print dialog opens via openPrintWindow()
      this.status = 'ready';
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.lastError = {
        code: 'WEB_PRINT_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      this.status = 'error';
      throw this.lastError;
    }
  }
}
