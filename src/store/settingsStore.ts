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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,

      load: async () => {
        const row = await db.settings.get('app')
        if (row) {
          const { id: _id, ...settings } = row
          set({ settings: settings as AppSettings })
        }
      },

      save: async (partial) => {
        set((state) => {
          const updated = { ...state.settings, ...partial }
          db.settings.put({ id: 'app', ...updated })
          return { settings: updated }
        })
      },
    }),
    { name: 'settings-store' }
  )
)
