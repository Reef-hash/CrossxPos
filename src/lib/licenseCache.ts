/**
 * CrossxPOS — License Grace Cache
 *
 * Stores the last successful server validation result in localStorage.
 * Allows the app to continue running offline for up to GRACE_DAYS (3 days).
 *
 * Cache key: 'crossx-license-cache'
 * Format: JSON { licenseKey, validatedAt, plan, expiresAt }
 */

import type { V1LicenseResponse } from './licenseApi'

export const GRACE_DAYS = 3

const CACHE_KEY = 'crossx-license-cache'

interface LicenseCacheEntry {
  licenseKey: string
  validatedAt: string   // ISO timestamp
  plan?: string
  expiresAt?: string
  customerName?: string
}

/** Save a successful validation result to cache. */
export function saveLicenseCache(licenseKey: string, response: V1LicenseResponse): void {
  try {
    const entry: LicenseCacheEntry = {
      licenseKey,
      validatedAt: new Date().toISOString(),
      plan: response.plan,
      expiresAt: response.expiresAt,
      customerName: response.customerName,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // localStorage unavailable — non-fatal
  }
}

/** Clear cache (on deactivation or explicit reset). */
export function clearLicenseCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // non-fatal
  }
}

export interface GraceCacheResult {
  valid: boolean
  entry?: LicenseCacheEntry
  /** True if cache exists but grace period has expired. */
  graceExpired?: boolean
}

/**
 * Check if a valid grace cache exists for the given key.
 * Returns valid=true if cache is present and within GRACE_DAYS.
 */
export function checkGraceCache(licenseKey: string): GraceCacheResult {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { valid: false }

    const entry: LicenseCacheEntry = JSON.parse(raw)

    if (entry.licenseKey !== licenseKey) return { valid: false }

    const ageDays = (Date.now() - new Date(entry.validatedAt).getTime()) / 86_400_000

    if (ageDays > GRACE_DAYS) {
      return { valid: false, entry, graceExpired: true }
    }

    return { valid: true, entry }
  } catch {
    return { valid: false }
  }
}

/** Get raw cache entry without validation (for display purposes). */
export function getLicenseCacheEntry(): LicenseCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as LicenseCacheEntry) : null
  } catch {
    return null
  }
}
