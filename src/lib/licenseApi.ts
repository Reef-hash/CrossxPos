/**
 * CrossxPOS — License API Client (V1)
 *
 * Calls EZPos-Web backend V1 licensing endpoints.
 * Falls back to legacy endpoint if V1 returns 404.
 *
 * Server URL is read from VITE_LICENSE_API_URL env var.
 * Default: https://ezpos-landing.onrender.com
 */

import { generateId } from '@/lib/utils'

const BASE_URL = (import.meta.env.VITE_LICENSE_API_URL as string | undefined)
  ?.replace(/\/$/, '') ?? 'https://ezpos-landing.onrender.com'

const PRODUCT = 'crossxpos'
const TIMEOUT_MS = 10_000

// ─── Device ID ────────────────────────────────────────────────────────────────

const DEVICE_KEY = 'crossx-device-id'

/** Returns a stable browser installation ID (UUID stored in localStorage). */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = generateId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

// ─── Response Types ───────────────────────────────────────────────────────────

export type V1Decision = 'allow' | 'deny' | 'allow_temporarily'
export type V1Status =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'not_found'
  | 'product_mismatch'
  | 'device_mismatch'
  | 'seat_exceeded'

export interface V1LicenseResponse {
  valid: boolean
  decision: V1Decision
  status: V1Status
  reason_code: string
  client_action: string
  product?: string
  plan?: string
  expiresAt?: string
  customerName?: string
  expired?: boolean
  policy?: {
    graceDays: number
    revalidateAfterHours: number
  }
}

export interface ApiCallResult {
  /** True when server responded (regardless of license validity). */
  reachable: boolean
  /** True when decision === 'allow' or 'allow_temporarily'. */
  isValid: boolean
  /** True when network failed (offline, timeout, DNS error). */
  isOffline: boolean
  response?: V1LicenseResponse
  error?: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof TypeError) {
    // Fetch throws TypeError for many reasons, including CORS failures.
    // Only treat it as offline when the browser reports no network.
    return typeof window !== 'undefined' && 'navigator' in window && !window.navigator.onLine
  }
  return false
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate an existing activated license key against the server.
 * Used on app startup to recheck validity.
 */
export async function validateLicense(licenseKey: string): Promise<ApiCallResult> {
  const deviceId = getDeviceId()
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/licensing/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, product: PRODUCT, deviceId }),
    })

    if (res.status === 404 || res.status === 405) {
      // V1 not available, try legacy
      return validateLegacy(licenseKey)
    }

    const data: V1LicenseResponse = await res.json()
    return {
      reachable: true,
      isOffline: false,
      isValid: data.decision === 'allow' || data.decision === 'allow_temporarily',
      response: data,
    }
  } catch (err) {
    if (isNetworkError(err)) {
      return { reachable: false, isOffline: true, isValid: false, error: 'Network error' }
    }
    return { reachable: false, isOffline: false, isValid: false, error: String(err) }
  }
}

/**
 * Activate a license key on this device.
 * Called when user submits a key in LicenseActivationPage.
 */
export async function activateLicense(licenseKey: string): Promise<ApiCallResult> {
  const deviceId = getDeviceId()
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/v1/licensing/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, product: PRODUCT, deviceId }),
    })

    if (res.status === 404 || res.status === 405) {
      return validateLegacy(licenseKey)
    }

    const data: V1LicenseResponse = await res.json()
    return {
      reachable: true,
      isOffline: false,
      isValid: data.decision === 'allow' || data.decision === 'allow_temporarily',
      response: data,
    }
  } catch (err) {
    if (isNetworkError(err)) {
      return { reachable: false, isOffline: true, isValid: false, error: 'Network unavailable' }
    }
    return { reachable: false, isOffline: false, isValid: false, error: String(err) }
  }
}

/** Legacy fallback for old backend without V1 endpoints. */
async function validateLegacy(licenseKey: string): Promise<ApiCallResult> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/licenses/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ LicenseKey: licenseKey, Product: PRODUCT }),
    })
    const data = await res.json()
    const isValid = data.valid === true || data.isValid === true
    return {
      reachable: true,
      isOffline: false,
      isValid,
      response: {
        valid: isValid,
        decision: isValid ? 'allow' : 'deny',
        status: isValid ? 'valid' : 'not_found',
        reason_code: isValid ? 'VALID' : 'LICENSE_NOT_FOUND',
        client_action: isValid ? 'continue' : 'check_key_or_contact_support',
        plan: data.plan,
        expiresAt: data.expiresAt,
      },
    }
  } catch (err) {
    if (isNetworkError(err)) {
      return { reachable: false, isOffline: true, isValid: false, error: 'Network error' }
    }
    return { reachable: false, isOffline: false, isValid: false, error: String(err) }
  }
}
