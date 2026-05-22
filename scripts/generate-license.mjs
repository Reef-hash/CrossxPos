#!/usr/bin/env node
/**
 * CrossxPOS — License Key Generator
 * ===================================
 * Skrip CLI untuk menjana license key bagi setiap pelanggan (pemilik restoran).
 *
 * PENGGUNAAN:
 *   node scripts/generate-license.mjs --plan basic --restaurant "Kedai Makan ABC" --id LIC-0001
 *   node scripts/generate-license.mjs --plan pro --restaurant "Restaurant XYZ" --id LIC-0002 --days 730
 *
 * PARAMETER:
 *   --plan         Plan lesen: basic | pro           (default: basic)
 *   --restaurant   Nama restoran pelanggan           (wajib)
 *   --id           ID unik lesen (cth: LIC-0001)     (default: LIC-<timestamp>)
 *   --days         Tempoh sah dalam hari             (default: 365)
 *
 * ⚠️  PENTING — KESELAMATAN:
 *   1. Jangan kongsi HMAC_SECRET ini secara terbuka.
 *   2. Secret mesti sepadan dengan nilai dalam src/lib/license.ts.
 *   3. Tukar secret sebelum deployment ke production.
 *   4. Jangan commit skrip ini ke repositori awam jika secret sudah ditukar.
 */

import { createHmac } from 'node:crypto'

// ─── PENTING: Mesti sepadan dengan src/lib/license.ts ────────────────────────
const _a = 'cxpos'
const _b = '-lic-'
const _c = 'hmac-'
const _d = 's3cr3t'
const _e = '-v1'
const HMAC_SECRET = _a + _b + _c + _d + _e

// ─── Definisi Plan ────────────────────────────────────────────────────────────
const PLANS = {
  basic: {
    limits: { maxStaff: 3, maxTables: 10, maxProducts: 50 },
    features: {
      voidOrder: true,
      exportReports: false,
      dateRangeReports: false,
      splitBill: false,
      discount: false,
      multiSection: false,
    },
  },
  pro: {
    limits: { maxStaff: 15, maxTables: -1, maxProducts: -1 },
    features: {
      voidOrder: true,
      exportReports: true,
      dateRangeReports: true,
      splitBill: true,
      discount: true,
      multiSection: true,
    },
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Encode string UTF-8 ke Base64url */
function base64urlEncode(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/** Kira tandatangan HMAC-SHA256 dan encode sebagai Base64url */
function signHmac(message) {
  return createHmac('sha256', HMAC_SECRET)
    .update(message, 'utf8')
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/** Format tarikh sebagai YYYY-MM-DD */
function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

/** Format had: -1 → "∞" */
function fmt(val) {
  return val === -1 ? '∞' : String(val)
}

// ─── Generator ────────────────────────────────────────────────────────────────

function generateLicense({ plan, restaurantName, licenseId, daysValid }) {
  const planDef = PLANS[plan]
  if (!planDef) {
    console.error(`\n❌  Plan tidak dikenali: "${plan}". Gunakan: basic | pro\n`)
    process.exit(1)
  }

  if (!restaurantName || restaurantName.trim() === '') {
    console.error('\n❌  --restaurant wajib diisi. Contoh: --restaurant "Kedai Makan ABC"\n')
    process.exit(1)
  }

  const now = new Date()
  const expiry = new Date(now.getTime() + daysValid * 86_400_000)

  const payload = {
    licenseId,
    plan,
    restaurantName: restaurantName.trim(),
    limits: planDef.limits,
    features: planDef.features,
    issuedAt: toDateStr(now),
    expiresAt: toDateStr(expiry),
  }

  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  const signature = signHmac(encodedPayload)

  return {
    key: `CROSSX-${encodedPayload}.${signature}`,
    payload,
    expiry,
    daysValid,
  }
}

// ─── Parse argumen CLI ────────────────────────────────────────────────────────

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    args[argv[i].slice(2)] = argv[i + 1] ?? ''
    i++
  }
}

const plan = (args.plan || 'basic').toLowerCase()
const restaurantName = args.restaurant || ''
const licenseId = args.id || `LIC-${Date.now()}`
const daysValid = parseInt(args.days || '365') || 365

// ─── Jana dan papar ───────────────────────────────────────────────────────────

const { key, payload, expiry } = generateLicense({ plan, restaurantName, licenseId, daysValid })
const limits = PLANS[plan].limits

console.log('\n╔══════════════════════════════════════════════╗')
console.log('║        CrossxPOS — License Generated         ║')
console.log('╚══════════════════════════════════════════════╝')
console.log(`\n  📋  License ID  : ${licenseId}`)
console.log(`  🏪  Restoran    : ${restaurantName || '(tiada)'}`)
console.log(`  📦  Plan        : ${plan.toUpperCase()}`)
console.log(`  👤  Had Staff   : ${fmt(limits.maxStaff)}`)
console.log(`  🪑  Had Meja    : ${fmt(limits.maxTables)}`)
console.log(`  🍽️   Had Produk  : ${fmt(limits.maxProducts)}`)
console.log(`  📅  Dijana      : ${payload.issuedAt}`)
console.log(`  ⏳  Tamat       : ${payload.expiresAt}  (${daysValid} hari)`)
console.log('\n  🔑  License Key:\n')
console.log(`  ${key}`)
console.log('\n' + '─'.repeat(60))
console.log('  Hantar kunci di atas kepada pelanggan untuk diaktifkan')
console.log('  dalam halaman Settings → Lesen & Plan.')
console.log('─'.repeat(60) + '\n')
