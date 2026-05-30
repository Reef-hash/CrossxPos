import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '@/db'
import type { Shift } from '@/types'
import { generateId } from '@/lib/utils'

interface ShiftState {
  currentShift: Shift | null
  openShift: (cashFloat: number, staffId: string, staffName: string) => Promise<void>
  closeShift: (staffId: string, staffName: string, closingCash?: number) => Promise<void>
  loadCurrentShift: () => Promise<void>
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      currentShift: null,

      openShift: async (cashFloat, staffId, staffName) => {
        // Close any lingering open shift first (safety)
        const lingering = await db.shifts.where('status').equals('open').first()
        if (lingering) {
          await db.shifts.update(lingering.id, {
            status: 'closed',
            closedAt: new Date(),
            closedBy: staffName,
            closedById: staffId,
          })
        }
        const shift: Shift = {
          id: generateId(),
          status: 'open',
          openedAt: new Date(),
          openedBy: staffName,
          openedById: staffId,
          cashFloat,
        }
        await db.shifts.add(shift)
        set({ currentShift: shift })
      },

      closeShift: async (staffId, staffName, closingCash) => {
        const current = get().currentShift
        if (!current) return
        const updated: Shift = {
          ...current,
          status: 'closed',
          closedAt: new Date(),
          closedBy: staffName,
          closedById: staffId,
          closingCash,
        }
        await db.shifts.put(updated)
        set({ currentShift: null })
      },

      loadCurrentShift: async () => {
        const open = await db.shifts.where('status').equals('open').first()
        set({ currentShift: open ?? null })
      },
    }),
    { name: 'shift-store' }
  )
)
