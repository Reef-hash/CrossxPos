import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '@/types'
import { db } from '@/db'

interface SettingsState {
  settings: AppSettings
  load: () => Promise<void>
  save: (partial: Partial<AppSettings>) => Promise<void>
}

const defaultSettings: AppSettings = {
  restaurantName: 'My Restaurant',
  currency: 'MYR',
  taxRate: 6,
  receiptFooter: 'Thank you for dining with us!',
  receiptPrinter: { ip: '192.168.1.100', port: 9100, enabled: false },
  kitchenPrinter: { ip: '192.168.1.101', port: 9100, enabled: false },
  kitchenStations: ['Kitchen', 'Bar'],
  printerProfiles: [],
  stationPrinterMap: {},
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      load: async () => {
        const row = await db.settings.get('app')
        if (row) {
          const { id: _id, ...rowSettings } = row
          // Merge with defaults so new fields appear for existing installs
          set({ settings: { ...defaultSettings, ...rowSettings } as AppSettings })
        }
      },

      save: async (partial) => {
        let updated: AppSettings = defaultSettings
        set((state) => {
          updated = { ...state.settings, ...partial }
          return { settings: updated }
        })
        await db.settings.put({ id: 'app', ...updated })
      },
    }),
    { name: 'settings-store' }
  )
)
