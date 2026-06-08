/**
 * CrossxPOS — License Store (Zustand)
 *
 * Server-authoritative licensing using EZPos-Web V1 licensing API.
 * Falls back to grace cache (3 days) when server is unreachable.
 * HMAC offline verification retained as last-resort legacy fallback.
 *
 * Flow:
 *   activate(key) → POST /api/v1/licensing/activate → save cache → active
 *   revalidate()  → POST /api/v1/licensing/validate → refresh cache
 *   offline       → checkGraceCache() → grace (≤3d) or grace_expired (>3d)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { activateLicense as apiActivate, validateLicense as apiValidate } from '@/lib/licenseApi'
import { saveLicenseCache, clearLicenseCache, checkGraceCache } from '@/lib/licenseCache'
import { verifyLicenseKey, isLicenseExpired, isWithinLimit, EMPTY_LIMITS, EMPTY_FEATURES } from '@/lib/license'
import type { LicenseData, LicenseStatus, LicenseLimits, LicenseFeatures } from '@/types'

interface LicenseState {
  license: LicenseData | null
  status: LicenseStatus
  rawKey: string
  /** Human-readable reason from last server response or grace check. */
  statusMessage: string

  /**
   * Activate a license key via server.
   * Falls back to HMAC only if server is completely unreachable (offline).
   */
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>

  /**
   * Revalidate stored key against server on app startup.
   * Called by App.tsx after DB init.
   */
  revalidate: () => Promise<void>

  getEffectiveStatus: () => LicenseStatus
  getLimits: () => LicenseLimits
  getFeatures: () => LicenseFeatures
  canAdd: (resource: 'staff' | 'tables' | 'products', current: number) => boolean
  deactivate: () => void
}

// ─── Status message map ───────────────────────────────────────────────────────

function messageFromStatus(status: LicenseStatus, serverMsg?: string): string {
  if (serverMsg) return serverMsg
  const map: Record<LicenseStatus, string> = {
    active:           'Lesen aktif.',
    expired:          'Lesen telah tamat tempoh. Sila perbaharui.',
    invalid:          'Kunci lesen tidak sah.',
    not_activated:    'Lesen belum diaktifkan.',
    grace:            'Mod luar talian — lesen disahkan dari cache. Sambungkan semula dalam masa 3 hari.',
    grace_expired:    'Tempoh luar talian tamat. Sambung internet dan mulakan semula.',
    device_mismatch:  'Kunci ini terikat pada peranti lain. Hubungi sokongan untuk pindahan.',
    seat_exceeded:    'Had peranti dicapai. Lepaskan peranti lain atau naik taraf pelan.',
    revoked:          'Lesen telah dibatalkan. Hubungi sokongan.',
    product_mismatch: 'Kunci ini bukan untuk CrossxPOS.',
  }
  return map[status] ?? 'Status lesen tidak diketahui.'
}

// ─── Plan data from V1 response (limits/features from plan name) ──────────────

const PLAN_LIMITS: Record<string, LicenseLimits> = {
  basic:    { maxStaff: 3,  maxTables: 10, maxProducts: 50  },
  standard: { maxStaff: 10, maxTables: 30, maxProducts: 200 },
  pro:      { maxStaff: -1, maxTables: -1, maxProducts: -1  },
}

const PLAN_FEATURES: Record<string, LicenseFeatures> = {
  basic:    { voidOrder: true, exportReports: false, dateRangeReports: false, splitBill: false, discount: false, multiSection: false },
  standard: { voidOrder: true, exportReports: true,  dateRangeReports: true,  splitBill: true,  discount: true,  multiSection: false },
  pro:      { voidOrder: true, exportReports: true,  dateRangeReports: true,  splitBill: true,  discount: true,  multiSection: true  },
}

function limitsForPlan(plan?: string): LicenseLimits {
  return PLAN_LIMITS[plan?.toLowerCase() ?? ''] ?? PLAN_LIMITS['basic']
}

function featuresForPlan(plan?: string): LicenseFeatures {
  return PLAN_FEATURES[plan?.toLowerCase() ?? ''] ?? PLAN_FEATURES['basic']
}

function makeLicenseData(key: string, plan?: string, expiresAt?: string, restaurantName?: string): LicenseData {
  const p = (plan?.toLowerCase() ?? 'basic') as 'basic' | 'pro'
  return {
    licenseId: key,
    plan: p === 'pro' ? 'pro' : 'basic',
    restaurantName: restaurantName ?? '',
    limits: limitsForPlan(plan),
    features: featuresForPlan(plan),
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: expiresAt ?? '',
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      license: null,
      status: 'not_activated',
      rawKey: '',
      statusMessage: '',

      activateLicense: async (key: string) => {
        const trimmed = key.trim()
        // HMAC keys (CROSSX-...) are case-sensitive base64 — preserve case.
        // Server keys (CROSSXPOS-PLAN-SUFFIX) are uppercase — normalise only those.
        const normalised = trimmed.startsWith('CROSSX-') ? trimmed : trimmed.toUpperCase()

        // 1. Try server activate
        const result = await apiActivate(normalised)

        if (result.reachable) {
          if (result.isValid && result.response) {
            const resp = result.response
            saveLicenseCache(normalised, resp)
            const ld = makeLicenseData(normalised, resp.plan, resp.expiresAt, resp.customerName)
            set({ license: ld, status: 'active', rawKey: normalised, statusMessage: messageFromStatus('active') })
            return { success: true }
          }

          // Server rejected — map reason to message
          const status = mapServerStatus(result.response?.status)
          const msg = messageFromStatus(status)
          set({ status, statusMessage: msg })
          return { success: false, error: msg }
        }

        // 2. Server offline / CORS blocked — try HMAC offline fallback
        if (result.isOffline) {
          const hmacData = await verifyLicenseKey(normalised)
          if (hmacData && !isLicenseExpired(hmacData)) {
            set({ license: hmacData, status: 'active', rawKey: normalised, statusMessage: messageFromStatus('active') })
            return { success: true }
          }
          return {
            success: false,
            error: 'Tiada sambungan internet. Pengaktifan memerlukan sambungan. Cuba lagi apabila dalam talian.',
          }
        }

        return { success: false, error: result.error ?? 'Ralat tidak diketahui.' }
      },

      revalidate: async () => {
        const { rawKey } = get()
        if (!rawKey) return

        const result = await apiValidate(rawKey)

        if (result.reachable && result.isValid && result.response) {
          saveLicenseCache(rawKey, result.response)
          const ld = makeLicenseData(rawKey, result.response.plan, result.response.expiresAt, result.response.customerName)
          set({ license: ld, status: 'active', statusMessage: messageFromStatus('active') })
          return
        }

        if (result.reachable && !result.isValid) {
          const status = mapServerStatus(result.response?.status)
          clearLicenseCache()
          set({ status, statusMessage: messageFromStatus(status), license: null })
          return
        }

        // Offline — check HMAC first (for CROSSX- keys), then grace cache
        if (result.isOffline) {
          // HMAC keys are self-contained — verify offline without needing grace cache
          if (rawKey.startsWith('CROSSX-')) {
            const hmacData = await verifyLicenseKey(rawKey)
            if (hmacData && !isLicenseExpired(hmacData)) {
              set({ license: hmacData, status: 'active', statusMessage: messageFromStatus('active') })
              return
            }
            // HMAC key expired
            set({ status: 'expired', statusMessage: messageFromStatus('expired'), license: null })
            return
          }
          // Server keys — fall back to grace cache
          const grace = checkGraceCache(rawKey)
          if (grace.valid) {
            set({ status: 'grace', statusMessage: messageFromStatus('grace') })
          } else {
            clearLicenseCache()
            set({ status: 'grace_expired', statusMessage: messageFromStatus('grace_expired'), license: null })
          }
        }
      },

      getEffectiveStatus: () => {
        const { license, status } = get()
        if (!license) return status === 'grace' ? 'grace' : 'not_activated'
        if (isLicenseExpired(license) && status === 'active') return 'expired'
        return status
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
        if (resource === 'staff')    return isWithinLimit(current, limits.maxStaff)
        if (resource === 'tables')   return isWithinLimit(current, limits.maxTables)
        if (resource === 'products') return isWithinLimit(current, limits.maxProducts)
        return false
      },

      deactivate: () => {
        clearLicenseCache()
        set({ license: null, status: 'not_activated', rawKey: '', statusMessage: '' })
      },
    }),
    { name: 'crossx-license-store' },
  ),
)

function mapServerStatus(s?: string): LicenseStatus {
  switch (s) {
    case 'valid':            return 'active'
    case 'expired':          return 'expired'
    case 'revoked':          return 'revoked'
    case 'not_found':        return 'invalid'
    case 'product_mismatch': return 'product_mismatch'
    case 'device_mismatch':  return 'device_mismatch'
    case 'seat_exceeded':    return 'seat_exceeded'
    default:                 return 'invalid'
  }
}
