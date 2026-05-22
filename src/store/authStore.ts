import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Staff } from '@/types'

interface AuthState {
  currentStaff: Staff | null
  isAuthenticated: boolean
  login: (staff: Staff) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentStaff: null,
      isAuthenticated: false,
      login: (staff) => set({ currentStaff: staff, isAuthenticated: true }),
      logout: () => set({ currentStaff: null, isAuthenticated: false }),
    }),
    { name: 'auth-store' }
  )
)
