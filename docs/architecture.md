# CrossxPOS — Architecture

## Folder Structure

```
CrossxPos/
├── docs/                        # Dokumentasi projek
├── public/
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Router + ProtectedRoute + DB init
│   ├── index.css                # Tailwind v4 import
│   │
│   ├── types/
│   │   └── index.ts             # Semua TypeScript interfaces & types
│   │
│   ├── lib/
│   │   ├── utils.ts             # cn(), formatCurrency(), generateId(), generateOrderNumber()
│   │   ├── license.ts           # HMAC-SHA256 verifikasi lesen (Web Crypto API)
│   │   └── printer.ts           # Receipt/kitchen ticket HTML builder + window.print()
│   │
│   ├── db/
│   │   └── index.ts             # Dexie DB class + initializeDatabase() seed
│   │
│   ├── store/
│   │   ├── authStore.ts         # Login/logout, currentStaff (persisted)
│   │   ├── cartStore.ts         # Active order, add/remove items, payment
│   │   ├── licenseStore.ts      # License state + limit checks (persisted)
│   │   ├── settingsStore.ts     # AppSettings sync dengan DB (persisted)
│   │   └── shiftStore.ts        # Shift open/close, currentShift (persisted)
│   │
│   ├── components/
│   │   ├── ui/                  # Reusable UI atoms (shadcn-style)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── label.tsx
│   │   │   └── separator.tsx
│   │   └── layout/
│   │       ├── AppLayout.tsx    # Shell: Sidebar + <Outlet />
│   │       └── Sidebar.tsx      # Nav links, role-filtered, logout
│   │
│   └── pages/
│       ├── auth/
│       │   ├── LoginPage.tsx        # PIN numpad login, redirect ikut role
│       │   └── UnauthorizedPage.tsx # Akses ditolak — butang ke role home
│       ├── license/
│       │   └── LicenseActivationPage.tsx  # Aktifkan / perbaharui lesen
│       ├── cashier/
│       │   └── CashierPage.tsx  # POS: Take Away/Dine In, cart, KOT + Checkout
│       ├── orders/
│       │   └── OrdersPage.tsx   # Active order queue (open+sent_to_kitchen), Add/Checkout
│       ├── kitchen/
│       │   └── KitchenPage.tsx  # Kitchen display — sent_to_kitchen orders sahaja
│       ├── tables/
│       │   └── TablesPage.tsx   # Table management: tambah/buang, merah/hijau dari DB
│       ├── menu/
│       │   └── MenuPage.tsx     # CRUD products, categories, modifier groups & options
│       ├── reports/
│       │   └── ReportsPage.tsx  # Jualan: date range, hourly chart, top products, kategori, CSV export
│       ├── staff/
│       │   └── StaffPage.tsx    # CRUD staff, assign role & PIN
│       └── settings/
│           └── SettingsPage.tsx # Restaurant info, tax rate, printer config
│
├── vite.config.ts               # Tailwind plugin + @ path alias
├── tsconfig.app.json            # paths alias @/* → src/*
└── package.json
```

## Data Flow

```
User Action
    │
    ▼
Page Component
    │
    ├─► Zustand Store  ──────────► Dexie DB (IndexedDB)
    │   (in-memory state)         (persisted to disk)
    │
    └─► useLiveQuery()  ◄────────► Dexie DB (reactive)
        (auto-rerender on DB change)
```

## Database Schema (Dexie v4)

```
Table: staff
  id (PK) | name | pin | role | isActive | createdAt

Table: categories
  id (PK) | name | sortOrder | isActive | modifierGroupIds[]  ← assign modifier ke seluruh category

Table: modifierGroups
  id (PK) | name | type (single|multiple) | required | minSelect | maxSelect

Table: modifierOptions
  id (PK) | groupId | name | price | sortOrder

Table: products
  id (PK) | categoryId | name | description | price | image | modifierGroupIds | isActive | sortOrder

Table: dineTables  ← (bukan 'tables', reserved keyword dalam Dexie)
  id (PK) | number | capacity | status | currentOrderId | section

Table: orders
  id (PK) | orderNumber | type | tableId | tableNumber | staffId | staffName
          | items[] | status | subtotal | tax | discount | total
          | paymentMethod | amountPaid | change | note | shiftId
          | voidReason | createdAt | updatedAt | paidAt

Table: shifts  ← DB version 5
  id (PK) | status ('open'|'closed') | openedAt | closedAt
          | openedBy | openedById | closedBy | closedById
          | cashFloat | closingCash | notes
  Indexes: status, openedById, openedAt, closedAt

Table: settings
  id="app" | restaurantName | currency | taxRate | receiptFooter
           | receiptPrinter{ip, port, enabled}
           | kitchenPrinter{ip, port, enabled}
```

## License System

### Format Kunci
```
CROSSX-[BASE64URL_JSON_PAYLOAD].[BASE64URL_HMAC_SHA256_SIGNATURE]
```

### Flow Verifikasi (Offline)
1. Strip prefix `CROSSX-`, split pada `.`
2. Kira semula HMAC-SHA256 dari `encodedPayload` + `HMAC_SECRET`
3. Bandingkan dengan signature yang diterima
4. Decode payload JSON → `LicenseData`
5. Semak `expiresAt < Date.now()`

### HMAC Secret
- Sama antara `src/lib/license.ts` dan `scripts/generate-license.mjs`
- Split kepada beberapa const untuk menyukarkan pengekstrakan kasual
- **Tukar sebelum production deployment**

### Fail Berkaitan
| Fail | Peranan |
|---|---|
| `src/lib/license.ts` | Verifikasi, decode, helper functions |
| `src/store/licenseStore.ts` | State management, canAdd(), getLimits() |
| `src/pages/license/LicenseActivationPage.tsx` | UI input kunci |
| `scripts/generate-license.mjs` | CLI tool jana kunci (developer only) |
| `src/App.tsx → LicenseGuard` | Route guard utama |

## State Management

### authStore
```ts
{ currentStaff: Staff | null, isAuthenticated: boolean }
Actions: login(staff), logout()
Persist: localStorage ("auth-store")
```

### cartStore
```ts
{ activeOrder: Order | null }
Actions:
  startOrder(type, staffId, staffName, tableId?, tableNumber?)
  addItem(item)
  updateQuantity(itemId, qty)
  removeItem(itemId)
  setItemNote(itemId, note)
  setDiscount(amount)
  setOrderNote(note)
  sendToKitchen()        → mark pending items as 'sent', save to DB (status='sent_to_kitchen'), clear cart
  processPayment(method, amountPaid, taxRate) → pays, update table status='available', clear cart
  clearOrder()
  loadOrder(order)       → resume existing order (dari OrdersPage)
```

### settingsStore
```ts
{ settings: AppSettings }
Actions: load() → fetch from DB, save(partial) → update DB + state
Persist: localStorage ("settings-store")
```

### shiftStore
```ts
{ currentShift: Shift | null }
Actions:
  openShift(cashFloat, staffId, staffName)         → close lingering shifts, create new shift in DB
  closeShift(staffId, staffName, closingCash?)      → save closingCash to DB, clear currentShift
  loadCurrentShift()                                → query DB for open shift (called on app startup)
Persist: localStorage ("shift-store")
Note: loadCurrentShift() dipanggil dalam App.tsx useEffect sebagai fallback jika localStorage di-clear
```

## Routing

```
/login           → LoginPage (public)
/ (protected)    → AppLayout
  /             → RoleHomeRedirect (redirect ke home role: kitchen→/kitchen, lain→/cashier)
  /cashier       → RoleRoute [admin, cashier, waiter]  → CashierPage
  /orders        → RoleRoute [admin, cashier]          → OrdersPage
  /kitchen       → RoleRoute [admin, kitchen, cashier] → KitchenPage
  /tables        → RoleRoute [admin, cashier, waiter]  → TablesPage
  /menu          → RoleRoute [admin]                   → MenuPage
  /reports       → RoleRoute [admin]                   → ReportsPage
  /staff         → RoleRoute [admin, cashier]          → StaffPage  ← cashier: Shift tab sahaja
  /settings      → RoleRoute [admin]                   → SettingsPage
  /unauthorized  → UnauthorizedPage (akses ditolak)
*                → redirect to /
```

## RBAC (Role-Based Access Control)

### Fail Berkaitan
| Fail | Peranan |
|---|---|
| `src/App.tsx → RoleRoute` | Guard per route — check role vs allowedRoles |
| `src/App.tsx → RoleHomeRedirect` | Redirect `/` ke halaman utama berdasarkan role |
| `src/pages/auth/UnauthorizedPage.tsx` | Halaman akses ditolak |
| `src/pages/auth/LoginPage.tsx` | Login redirect ikut role |
| `src/components/layout/Sidebar.tsx` | Filter nav item ikut `currentStaff.role` |

### Jadual Kebenaran

| Halaman | admin | cashier | waiter | kitchen |
|---|:---:|:---:|:---:|:---:|
| `/cashier`  | ✅ | ✅ | ✅ | ❌ |
| `/orders`   | ✅ | ✅ | ❌ | ❌ |
| `/kitchen`  | ✅ | ✅ | ❌ | ✅ |
| `/tables`   | ✅ | ✅ | ✅ | ❌ |
| `/menu`     | ✅ | ❌ | ❌ | ❌ |
| `/reports`  | ✅ | ❌ | ❌ | ❌ |
| `/staff`    | ✅ | ✅\* | ❌ | ❌ |
| `/settings` | ✅ | ❌ | ❌ | ❌ |

> \* Cashier akses `/staff` untuk **Shift tab sahaja** (buka/tutup shift). Staff CRUD tab disembunyikan.

### Login Redirect Ikut Role
| Role | Redirect ke |
|---|---|
| `admin` | `/cashier` |
| `cashier` | `/cashier` |
| `waiter` | `/cashier` |
| `kitchen` | `/kitchen` |

`ProtectedRoute` check `isAuthenticated` dari authStore. Kalau tidak login → redirect ke `/login`.

`RoleRoute` check `currentStaff.role` vs `allowedRoles[]`. Kalau role tidak dibenarkan → redirect ke `/unauthorized`.

## Order Status Flow

```
open  ←──────────────────────────────────────────────────────────────┐
  │                                                                   │
  │  [KOT button di CashierPage]                                     │
  ▼                                                                   │
sent_to_kitchen  ←── OrdersPage: "Add Order" → tambah item → KOT lagi┘
  │
  ▼  [Checkout button di OrdersPage → CashierPage → processPayment]
paid

open/sent_to_kitchen → voided  (OrdersPage: butang Void, admin/cashier sahaja)
open/sent_to_kitchen → cancelled (manual, belum ada UI)
```

**OrderItem.status flow:**
```
pending → sent  (bila sendToKitchen dipanggil, item baru = pending → sent)
```
Item yang sudah `sent` tidak dihantar semula ke kitchen. Hanya item `pending` (baru ditambah selepas KOT pertama) yang dihantar bila KOT dipanggil semula.

## Table Status Flow

```
[TablesPage — management sahaja, tidak boleh buat order dari sini]

Warna meja dikira dari DB (live query):
  Merah = ada order aktif (open/sent_to_kitchen) dengan tableNumber ini
  Hijau = tiada order aktif

Table.status field masih ada dalam type (available/occupied/reserved/cleaning)
tapi tidak digunakan untuk display — status dikira dari orders DB.
```

## Printer Utility (`src/lib/printer.ts`)

Mencetak menggunakan `window.print()` dengan HTML berformat thermal (lebar 72mm).
TCP/ESC-POS terus ke printer LAN memerlukan Capacitor (Phase 7).

### Keputusan Implementasi Mobile (CrossxPos)

- Sasaran utama ialah Android tablet/cashier station terlebih dahulu.
- Guna `@capacitor-community/sqlite` untuk storage mobile supaya data offline kekal konsisten.
- Guna custom Capacitor native bridge untuk raw TCP 9100 ke ESC/POS printer.
- Jangan bergantung pada `window.print()` sebagai laluan print utama di dalam app mobile.
- Flow print yang sama perlu disokong untuk cashier, kitchen, dan test print.

### Public API
| Fungsi | Keterangan |
|---|---|
| `printReceipt(order, settings)` | Cetak resit pelanggan selepas bayar |
| `printKitchenTicket(order)` | Cetak tiket dapur semasa KOT |
| `testPrintReceipt(settings)` | Test print resit sampel |
| `testPrintKitchen()` | Test print tiket dapur sampel |

### Trigger Auto-Print
- `receiptPrinter.enabled = true` → `printReceipt()` dipanggil dalam `handlePayment` di CashierPage
- `kitchenPrinter.enabled = true` → `printKitchenTicket()` dipanggil dalam `handleKOT` di CashierPage
- Butang test print ada dalam SettingsPage (bawah setiap kad printer)
