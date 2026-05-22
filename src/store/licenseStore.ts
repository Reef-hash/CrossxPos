/**
 * CrossxPOS — License Store (Zustand)
 *
 * Menyimpan status lesen aktif dalam localStorage (persist).
 * Digunakan oleh LicenseGuard (App.tsx) dan halaman yang menguatkuasakan had plan.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  verifyLicenseKey,
  isLicenseExpired,
  isWithinLimit,
  EMPTY_LIMITS,
  EMPTY_FEATURES,
} from '@/lib/license'
import type { LicenseData, LicenseStatus, LicenseLimits, LicenseFeatures } from '@/types'

interface LicenseState {
  /** Data lesen yang sudah disahkan. Null jika belum diaktifkan. */
  license: LicenseData | null
  /** Status semasa lesen. */
  status: LicenseStatus
  /** Kunci mentah (raw key) yang dimasukkan pengguna. */
  rawKey: string

  /**
   * Sahkan dan aktifkan license key.
   * Mengembalikan { success: true } atau { success: false, error: string }.
   */
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Semak status lesen dengan mengambil kira tarikh luput semasa.
   * Lebih tepat daripada membaca `status` terus kerana ia semak Date.now().
   */
  getEffectiveStatus: () => LicenseStatus

  /** Hadkan sumber berdasarkan plan lesen aktif. */
  getLimits: () => LicenseLimits

  /** Feature flags berdasarkan plan lesen aktif. */
  getFeatures: () => LicenseFeatures

  /**
   * Semak sama ada boleh tambah sumber baru berdasarkan had plan.
   * @param resource - 'staff' | 'tables' | 'products'
   * @param current  - Bilangan rekod semasa dalam DB
   */
  canAdd: (resource: 'staff' | 'tables' | 'products', current: number) => boolean

  /** Padamkan lesen (untuk tujuan debug / reset). */
  deactivate: () => void
}

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      license: null,
      status: 'not_activated',
      rawKey: '',

      activateLicense: async (key: string) => {
        const trimmed = key.trim()
        const data = await verifyLicenseKey(trimmed)

        if (!data) {
          return {
            success: false,
            error: 'Kunci lesen tidak sah. Semak semula kunci yang diberikan oleh pembekal.',
          }
        }

        if (isLicenseExpired(data)) {
          return {
            success: false,
            error: `Lesen ini telah tamat tempoh pada ${data.expiresAt}. Sila hubungi pembekal untuk pembaharuan.`,
          }
        }

        set({ license: data, status: 'active', rawKey: trimmed })
        return { success: true }
      },

      getEffectiveStatus: () => {
        const { license } = get()
        if (!license) return 'not_activated'
        if (isLicenseExpired(license)) return 'expired'
        return 'active'
      },

      getLimits: () => {
        const { license } = get()
        if (!license) return EMPTY_LIMITS
        return license.limits
      },

      getFeatures: () => {
        const { license } = get()
        if (!license) return EMPTY_FEATURES
        return license.features
      },

      canAdd: (resource, current) => {
        const { license } = get()
        if (!license) return false
        const { limits } = license
        if (resource === 'staff') return isWithinLimit(current, limits.maxStaff)
        if (resource === 'tables') return isWithinLimit(current, limits.maxTables)
        if (resource === 'products') return isWithinLimit(current, limits.maxProducts)
        return false
      },

      deactivate: () => set({ license: null, status: 'not_activated', rawKey: '' }),
    }),
    { name: 'crossx-license-store' },
  ),
)
