/**
 * IPrinterAdapter
 *
 * Base interface for all printer hardware implementations (Wi-Fi, Bluetooth, USB, Web).
 * Ensures polymorphism across different connection types.
 */

export type PrinterStatus = 'disconnected' | 'connecting' | 'ready' | 'printing' | 'error';

export type PrinterType = 'wifi' | 'bluetooth' | 'usb' | 'web';

export interface PrinterConfig {
  /** Name/label for the printer (e.g., "Kitchen Hot Printer") */
  name?: string;
  /** IP address for Wi-Fi thermal printers */
  ip?: string;
  /** Port number for Wi-Fi printers (default: 9100) */
  port?: number;
  /** MAC address for Bluetooth printers */
  macAddress?: string;
  /** Device ID for USB printers */
  deviceId?: string;
}

export interface PrinterError {
  code: string;
  message: string;
  timestamp: Date;
}

export interface IPrinterAdapter {
  /** Adapter type identifier */
  readonly type: PrinterType;

  /** Current connection status */
  getStatus(): PrinterStatus;

  /**
   * Establish connection to printer with the given config.
   * Should throw or set error state if connection fails.
   */
  connect(config: PrinterConfig): Promise<void>;

  /** Disconnect from printer */
  disconnect(): Promise<void>;

  /**
   * Send raw ESC/POS byte data to printer.
   * Should throw or set error state if transmission fails.
   */
  print(data: Uint8Array): Promise<void>;

  /** Get the last error, if any */
  getLastError(): PrinterError | null;
}
