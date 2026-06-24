/**
 * Printer Zustand Store
 *
 * Persisted printer configuration.
 * Holds:
 * - List of configured printers (PrinterConfig[])
 * - Printer profiles with station mapping
 * - Which printer is used for receipts
 * - Status of each printer (online/offline)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PrinterConfig, PrinterProfile, StationPrinterMap } from '@/types'
import { generateId } from '@/lib/utils'
import { printerService } from './PrinterService'

// ─── State Shape ─────────────────────────────────────────────────────────────

interface PrinterState {
  /** All configured printers */
  printers: PrinterConfig[]
  /** Printer profiles (copy count, cutter, drawer settings) */
  profiles: PrinterProfile[]
  /** Which printer ID is used for customer receipts */
  receiptPrinterId: string | null
  /** Kitchen station → printer mapping */
  stationPrinters: StationPrinterMap[]
  /** Connection status: printerId → online/offline */
  printerStatus: Record<string, 'online' | 'offline'>

  // Actions
  addPrinter: (config: Omit<PrinterConfig, 'id'>) => string
  updatePrinter: (id: string, partial: Partial<PrinterConfig>) => void
  removePrinter: (id: string) => void
  setReceiptPrinter: (id: string | null) => void
  setStationPrinter: (station: string, printerId: string) => void
  removeStationPrinter: (station: string) => void
  addProfile: (profile: Omit<PrinterProfile, 'id'>) => string
  updateProfile: (id: string, partial: Partial<PrinterProfile>) => void
  removeProfile: (id: string) => void
  setPrinterStatus: (id: string, status: 'online' | 'offline') => void

  // Helpers
  getReceiptPrinter: () => PrinterConfig | null
  getStationPrinter: (station: string) => PrinterConfig | null
  getPrinterProfile: (printerId: string) => PrinterProfile | undefined

  // Operations
  testPrinter: (id: string) => Promise<void>
  refreshPrinterStatus: () => Promise<void>
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set, get) => ({
      printers: [],
      profiles: [],
      receiptPrinterId: null,
      stationPrinters: [],
      printerStatus: {},

      // ─── CRUD ──────────────────────────────────────────────────────────

      addPrinter: (config) => {
        const id = generateId()
        set((s) => ({ printers: [...s.printers, { ...config, id }] }))
        return id
      },

      updatePrinter: (id, partial) => {
        set((s) => ({
          printers: s.printers.map((p) => (p.id === id ? { ...p, ...partial } : p)),
        }))
      },

      removePrinter: (id) => {
        set((s) => ({
          printers: s.printers.filter((p) => p.id !== id),
          profiles: s.profiles.filter((p) => p.printerId !== id),
          stationPrinters: s.stationPrinters.filter((sp) => sp.printerId !== id),
          receiptPrinterId: s.receiptPrinterId === id ? null : s.receiptPrinterId,
          printerStatus: deleteKey(s.printerStatus, id),
        }))
      },

      setReceiptPrinter: (id) => set({ receiptPrinterId: id }),

      setStationPrinter: (station, printerId) => {
        set((s) => {
          const existing = s.stationPrinters.find((sp) => sp.station === station)
          if (existing) {
            return {
              stationPrinters: s.stationPrinters.map((sp) =>
                sp.station === station ? { ...sp, printerId } : sp
              ),
            }
          }
          return {
            stationPrinters: [...s.stationPrinters, { station, printerId }],
          }
        })
      },

      removeStationPrinter: (station) => {
        set((s) => ({
          stationPrinters: s.stationPrinters.filter((sp) => sp.station !== station),
        }))
      },

      addProfile: (profile) => {
        const id = generateId()
        set((s) => ({ profiles: [...s.profiles, { ...profile, id }] }))
        return id
      },

      updateProfile: (id, partial) => {
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...partial } : p)),
        }))
      },

      removeProfile: (id) => {
        set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }))
      },

      setPrinterStatus: (id, status) => {
        set((s) => ({ printerStatus: { ...s.printerStatus, [id]: status } }))
      },

      // ─── Helpers ───────────────────────────────────────────────────────

      getReceiptPrinter: () => {
        const { printers, receiptPrinterId } = get()
        return printers.find((p) => p.id === receiptPrinterId && p.isActive) ?? null
      },

      getStationPrinter: (station) => {
        const { printers, stationPrinters } = get()
        const map = stationPrinters.find((sp) => sp.station === station)
        if (!map) return null
        return printers.find((p) => p.id === map.printerId && p.isActive) ?? null
      },

      getPrinterProfile: (printerId) => {
        return get().profiles.find((p) => p.printerId === printerId)
      },

      // ─── Operations ────────────────────────────────────────────────────

      testPrinter: async (id) => {
        const printer = get().printers.find((p) => p.id === id)
        if (!printer) return
        try {
          await printerService.testPrint(printer)
          set((s) => ({ printerStatus: { ...s.printerStatus, [id]: 'online' } }))
        } catch (err) {
          console.warn(`[PrinterStore] Test failed for ${printer.name}:`, err)
          set((s) => ({ printerStatus: { ...s.printerStatus, [id]: 'offline' } }))
          throw err
        }
      },

      refreshPrinterStatus: async () => {
        // Placeholder: in future, check each printer's connectivity
        // For now, status is updated by testPrint / actual print operations
      },
    }),
    {
      name: 'printer-store',
      // Only persist config, not status
      partialize: (state) => ({
        printers: state.printers,
        profiles: state.profiles,
        receiptPrinterId: state.receiptPrinterId,
        stationPrinters: state.stationPrinters,
      }),
    }
  )
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deleteKey<T extends Record<string, unknown>>(obj: T, key: string): T {
  const { [key]: _, ...rest } = obj
  return rest as T
}
