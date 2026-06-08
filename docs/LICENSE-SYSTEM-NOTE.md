# CrossxPos License System Analysis Note

## Short Summary

CrossxPos currently uses a hybrid license model:

1. **Server-authoritative flow** for normal activation and revalidation via EZPos-Web API.
2. **Offline HMAC fallback** for legacy `CROSSX-...` keys, verified locally in the frontend.

The current design works offline, but key security controls (secret protection, device identity strength, tamper resistance) are weak for production-grade anti-abuse, especially when moving to Capacitor/mobile packaging.

## 1) License Key Generation & Verification (HMAC-SHA256)

### Generation (CLI)
- File: `scripts/generate-license.mjs`
- Builds JSON payload (`licenseId`, `plan`, `limits`, `features`, `issuedAt`, `expiresAt`)
- Encodes payload as base64url
- Signs payload using HMAC-SHA256
- Final key format:
  - `CROSSX-[BASE64URL_PAYLOAD].[BASE64URL_SIGNATURE]`

```js
const encodedPayload = base64urlEncode(JSON.stringify(payload))
const signature = signHmac(encodedPayload)
return { key: `CROSSX-${encodedPayload}.${signature}` }
```

### Verification (Frontend, Offline)
- File: `src/lib/license.ts`
- Confirms `CROSSX-` prefix and split format
- Recomputes HMAC signature from `encodedPayload`
- Compares with provided signature
- Decodes payload JSON if valid

```ts
const expectedSig = await computeHmac(encodedPayload, HMAC_SECRET)
if (signature !== expectedSig) return null
const payload = JSON.parse(new TextDecoder('utf-8').decode(decodeBase64url(encodedPayload)))
```

## 2) Secret Key Storage (Hardcoded?)

Yes. The HMAC secret is hardcoded in both:

- `src/lib/license.ts`
- `scripts/generate-license.mjs`

It is split into fragments but still recoverable from code/bundle.

```ts
const _a = 'cxpos'
const _b = '-lic-'
const _c = 'hmac-'
const _d = 's3cr3t'
const _e = '-v1'
const HMAC_SECRET = _a + _b + _c + _d + _e
```

**Impact:** anyone extracting this secret can mint valid offline keys.

## 3) Current Device Binding Method

Device binding is not true HWID. It uses a generated UUID stored in localStorage.

- File: `src/lib/licenseApi.ts`
- Key: `crossx-device-id`

```ts
const DEVICE_KEY = 'crossx-device-id'
let id = localStorage.getItem(DEVICE_KEY)
if (!id) {
  id = generateId()
  localStorage.setItem(DEVICE_KEY, id)
}
```

This can be reset/duplicated by clearing storage or cloning app state.

## 4) Multi-Device and Role-Based Access

### Multi-device
- Current runtime data is local Dexie/IndexedDB per device.
- No real shared live state across devices yet.
- Planned only: `docs/PLAN-MULTIDEVICE.md` (Supabase + future local hub strategy).

### Role-based access (RBAC)
- Route-level guard in `src/App.tsx` (`RoleRoute`).
- Navigation filtering in `src/components/layout/navItems.ts`, `Sidebar.tsx`, `MobileBottomNav.tsx`.
- Auth state in `src/store/authStore.ts` and PIN login from Dexie in `src/pages/auth/LoginPage.tsx`.

## 5) Main Files Involved and Their Roles

| File | Role |
|---|---|
| `src/lib/license.ts` | Offline HMAC verification and license helper logic |
| `scripts/generate-license.mjs` | Offline key generator and signer |
| `src/store/licenseStore.ts` | License state machine (activate/revalidate/offline grace/fallback) |
| `src/lib/licenseApi.ts` | Server API client + deviceId handling |
| `src/lib/licenseCache.ts` | 3-day grace cache in localStorage |
| `src/App.tsx` | License guard + protected/role routes |
| `src/store/authStore.ts` | Persisted login session state |
| `src/components/layout/navItems.ts` | Role-to-page permission mapping |
| `docs/PLAN-MULTIDEVICE.md` | Planned (not implemented) multi-device architecture |

## 6) Current Weaknesses (Offline + Capacitor Migration)

1. **Hardcoded HMAC secret in client path**  
   Secret disclosure enables forged offline-valid licenses.

2. **Weak device binding**  
   localStorage UUID is not hardware-backed identity.

3. **Offline fallback can bypass server controls**  
   For legacy HMAC keys, revocation/device-seat checks are not enforceable offline.

4. **Grace cache tamper risk**  
   Cache metadata (`validatedAt`, `plan`, etc.) in localStorage is not cryptographically protected.

5. **Client-side RBAC trust boundary**  
   RBAC is mainly enforced in frontend route/nav logic; local tampering risk remains.

6. **Capacitor migration considerations**  
   Current browser storage assumptions (localStorage/IndexedDB identity and cache) are not strong enough for mobile anti-tamper licensing. A Capacitor-ready model should move secret and device identity handling to secure native storage + server-issued signed tokens with short revalidation windows.
