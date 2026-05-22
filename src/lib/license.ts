/**
 * CrossxPOS — License Key Utility
 *
 * Mengesahkan license key secara offline menggunakan HMAC-SHA256 (Web Crypto API).
 * Key dijana oleh skrip `scripts/generate-license.mjs` menggunakan secret yang sama.
 *
 * Format kunci: CROSSX-[BASE64URL_PAYLOAD].[BASE64URL_HMAC_SIGNATURE]
 *
 * ⚠️  PENTING: Tukar HMAC_SECRET sebelum deployment ke production.
 *    Secret yang sama mesti digunakan dalam generate-license.mjs.
 */

import type { LicenseData, LicenseLimits, LicenseFeatures } from '@/types'

// ─── Secret (split untuk menyukarkan pengekstrakan kasual) ───────────────────
// Mesti sepadan dengan HMAC_SECRET dalam scripts/generate-license.mjs
const _a = 'cxpos'
const _b = '-lic-'
const _c = 'hmac-'
const _d = 's3cr3t'
const _e = '-v1'
const HMAC_SECRET = _a + _b + _c + _d + _e

// ─── Definisi plan (reference sahaja — nilai sebenar dikodkan dalam key) ─────
export const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
}

// ─── Helpers Base64url ────────────────────────────────────────────────────────

function encodeBase64url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function decodeBase64url(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─── HMAC-SHA256 (Web Crypto API) ────────────────────────────────────────────

async function computeHmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return encodeBase64url(new Uint8Array(sig))
}

// ─── API Awam ─────────────────────────────────────────────────────────────────

/**
 * Sahkan dan decode license key CrossxPOS.
 * Mengembalikan LicenseData jika sah, atau null jika tidak sah / rosak.
 */
export async function verifyLicenseKey(key: string): Promise<LicenseData | null> {
  try {
    key = key.trim()
    if (!key.startsWith('CROSSX-')) return null
    const parts = key.slice(7).split('.')
    if (parts.length !== 2) return null

    const [encodedPayload, signature] = parts
    const expectedSig = await computeHmac(encodedPayload, HMAC_SECRET)
    if (signature !== expectedSig) return null

    const jsonBytes = decodeBase64url(encodedPayload)
    const json = new TextDecoder('utf-8').decode(jsonBytes)
    const payload = JSON.parse(json) as LicenseData
    return payload
  } catch {
    return null
  }
}

/** Mengembalikan true jika tarikh tamat lesen telah lepas. */
export function isLicenseExpired(license: LicenseData): boolean {
  return new Date(license.expiresAt) < new Date()
}

/**
 * Semak sama ada bilangan semasa masih dalam had plan.
 * max === -1 bermaksud tiada had (unlimited).
 */
export function isWithinLimit(current: number, max: number): boolean {
  if (max === -1) return true
  return current < max
}

/** Bilangan hari sebelum lesen tamat. Mengembalikan 0 jika sudah tamat. */
export function daysUntilExpiry(license: LicenseData): number {
  const diff = new Date(license.expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

/** Format nilai had: -1 → "∞", lain-lain → nombor biasa. */
export function formatLimit(max: number): string {
  return max === -1 ? '∞' : String(max)
}

// ─── Default (kosong) untuk sebelum lesen diaktifkan ─────────────────────────

export const EMPTY_LIMITS: LicenseLimits = {
  maxStaff: 0,
  maxTables: 0,
  maxProducts: 0,
}

export const EMPTY_FEATURES: LicenseFeatures = {
  voidOrder: false,
  exportReports: false,
  dateRangeReports: false,
  splitBill: false,
  discount: false,
  multiSection: false,
}
