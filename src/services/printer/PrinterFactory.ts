/**
 * PrinterFactory
 *
 * Factory for creating the appropriate printer adapter based on connection type.
 * Currently supports 'web' (fallback). Wi-Fi, Bluetooth, and USB adapters will be added in later phases.
 */

import type { IPrinterAdapter, PrinterType } from './adapters/IPrinterAdapter';
import { WebFallbackAdapter } from './adapters/WebFallbackAdapter';
import { WifiAdapter } from './adapters/WifiAdapter';

export class PrinterFactory {
  /**
   * Create a printer adapter of the specified type.
   *
   * @param type - The printer connection type: 'wifi', 'bluetooth', 'usb', or 'web'
   * @returns An instance implementing IPrinterAdapter
   * @throws Error if the adapter type is not yet implemented
   */
  static createAdapter(type: PrinterType): IPrinterAdapter {
    switch (type) {
      case 'web':
        return new WebFallbackAdapter();

      case 'wifi':
        return new WifiAdapter();

      case 'bluetooth':
        throw new Error(
          'Bluetooth adapter not yet implemented. Phase 5: Future Hardware Expansion'
        );

      case 'usb':
        throw new Error(
          'USB adapter not yet implemented. Phase 5: Future Hardware Expansion'
        );

      default:
        throw new Error(`Unknown printer type: ${type}`);
    }
  }
}
