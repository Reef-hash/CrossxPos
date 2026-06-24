/**
 * Printer connection interface.
 * Each printer type (Network, Bluetooth, USB) implements this.
 */
export interface IPrinterConnection {
  /** Establish connection to the printer */
  connect(): Promise<void>
  /** Close the connection */
  disconnect(): Promise<void>
  /** Send raw bytes to the printer */
  write(data: Uint8Array): Promise<void>
  /** Whether the connection is currently open */
  isConnected(): boolean
}
