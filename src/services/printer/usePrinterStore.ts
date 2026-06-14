/**
 * usePrinterStore
 *
 * Zustand store for printer state management (ViewModel pattern).
 * Manages active adapter, connection status, and provides methods for UI components.
 */

import { create } from 'zustand';
import { PrinterFactory } from './PrinterFactory';
import type { IPrinterAdapter, PrinterConfig, PrinterStatus, PrinterType, PrinterError } from './adapters/IPrinterAdapter';

interface PrinterStoreState {
  // State
  activeType: PrinterType | null;
  adapter: IPrinterAdapter | null;
  status: PrinterStatus;
  lastError: PrinterError | null;
  config: PrinterConfig | null;

  // Actions
  setActiveType: (type: PrinterType) => void;
  connect: (type: PrinterType, config: PrinterConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  print: (data: Uint8Array) => Promise<void>;
  clearError: () => void;
}

export const usePrinterStore = create<PrinterStoreState>((set, get) => ({
  // Initial state
  activeType: null,
  adapter: null,
  status: 'disconnected',
  lastError: null,
  config: null,

  // Switch printer type and create new adapter
  setActiveType: (type: PrinterType) => {
    const newAdapter = PrinterFactory.createAdapter(type);
    set({
      activeType: type,
      adapter: newAdapter,
      status: newAdapter.getStatus(),
      lastError: null,
    });
  },

  // Connect adapter with config
  connect: async (type: PrinterType, config: PrinterConfig) => {
    try {
      let adapter = get().adapter;

      // Create new adapter if type changed
      if (get().activeType !== type) {
        adapter = PrinterFactory.createAdapter(type);
        set({ activeType: type, adapter });
      }

      if (!adapter) throw new Error('Failed to create adapter');

      set({ status: 'connecting', lastError: null, config });
      await adapter.connect(config);

      set({
        status: adapter.getStatus(),
        config,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const lastError: PrinterError = {
        code: 'CONNECTION_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      set({
        status: 'error',
        lastError,
      });
      throw lastError;
    }
  },

  // Disconnect adapter
  disconnect: async () => {
    try {
      const { adapter } = get();
      if (adapter) {
        await adapter.disconnect();
      }
      set({
        status: 'disconnected',
        adapter: null,
        activeType: null,
        config: null,
        lastError: null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const lastError: PrinterError = {
        code: 'DISCONNECT_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      set({ lastError });
      throw lastError;
    }
  },

  // Send data to printer
  print: async (data: Uint8Array) => {
    try {
      const { adapter, status } = get();

      if (!adapter || status !== 'ready') {
        throw new Error('Printer not ready. Current status: ' + status);
      }

      await adapter.print(data);
      set({ status: adapter.getStatus() });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const lastError: PrinterError = {
        code: 'PRINT_ERROR',
        message: error.message,
        timestamp: new Date(),
      };
      set({
        status: 'error',
        lastError,
      });
      throw lastError;
    }
  },

  // Clear the last error
  clearError: () => {
    set({ lastError: null });
  },
}));
