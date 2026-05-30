# CrossxPOS — Todo / Backlog

## ✅ Siap

### Flow & UX (Terbaru)
- [x] CashierPage: pilih Take Away / Dine In + dropdown table sebelum order
- [x] CashierPage: button KOT (Kitchen Order Ticket) → hantar ke kitchen + navigate ke Orders
- [x] CashierPage: button Checkout → bayar terus
- [x] CartStore: `sendToKitchen()` mark items as `sent`, clear cart
- [x] OrdersPage: rewrite sebagai active order queue (open + sent_to_kitchen), tabs Take Away / Dine In
- [x] OrdersPage: butang "Add Order" → load order ke cart, navigate ke Cashier (tambah item)
- [x] OrdersPage: butang "Checkout" → load order ke cart, navigate ke Cashier (bayar)
- [x] TablesPage: management sahaja (bukan untuk buat order), buang meja, warna merah/hijau dari DB aktif
- [x] KitchenPage: simplified — hanya tunjuk `sent_to_kitchen`, tiada butang Ready
- [x] Sidebar nav order: Cashier → Orders → Kitchen → Tables → Menu → Reports → Staff → Settings

### Foundation
- [x] Vite + React + TypeScript scaffold
- [x] Tailwind CSS v4 + `@tailwindcss/vite`
- [x] Path alias `@/` → `src/`
- [x] React Router v6 setup
- [x] Zustand stores (auth, cart, settings)
- [x] Dexie.js IndexedDB schema + seed
- [x] `dexie-react-hooks` (`useLiveQuery`)
- [x] UI components (Button, Input, Card, Badge, Label, Separator)
- [x] AppLayout + Sidebar (role-filtered nav)
- [x] ProtectedRoute

### Pages
- [x] LoginPage — PIN numpad, 4-digit, lookup dari DB
- [x] CashierPage — category filter, product grid, cart, payment modal (cash/card/QR)
- [x] TablesPage — table grid, status colour-coded, start/resume dine-in order
- [x] KitchenPage — live order queue, mark item ready, mark order ready
- [x] MenuPage — CRUD categories, CRUD products (nama, harga, kategori)
- [x] OrdersPage — history table, filter by status
- [x] ReportsPage — date range filter, hourly chart, jualan ikut kategori, export CSV, kaedah pembayaran
- [x] StaffPage — CRUD staff, assign role (admin/cashier/waiter/kitchen), PIN
- [x] SettingsPage — restaurant name, currency, tax rate, receipt/kitchen printer IP:Port

---

### License Key System
- [x] `LicenseData`, `LicenseLimits`, `LicenseFeatures`, `LicenseStatus` types
- [x] `src/lib/license.ts` — HMAC-SHA256 verifikasi offline (Web Crypto API)
- [x] `src/store/licenseStore.ts` — Zustand persist store
- [x] `src/pages/license/LicenseActivationPage.tsx` — UI masukkan & aktifkan kunci
- [x] `App.tsx` — LicenseGuard (redirect ke aktivasi jika tiada/tamat lesen)
- [x] `StaffPage`, `TablesPage`, `MenuPage` — Enforce had plan (maxStaff/maxTables/maxProducts)
- [x] `SettingsPage` — Papar status plan, had penggunaan, renew kunci
- [x] `scripts/generate-license.mjs` — CLI tool jana kunci untuk pelanggan

#### Cara Jana Kunci (Developer):
```bash
node scripts/generate-license.mjs --plan basic --restaurant "Kedai Makan ABC" --id LIC-0001
node scripts/generate-license.mjs --plan pro --restaurant "Restaurant XYZ" --id LIC-0002 --days 730
```

#### Plan Limits:
| Had | Basic | Pro |
|---|---|---|
| Staff | 3 | 15 |
| Meja | 10 | Unlimited |
| Produk | 50 | Unlimited |
| Void Order | ✅ | ✅ |
| Export Reports | ❌ | ✅ |
| Split Bill | ❌ | ✅ |
| Discount | ❌ | ✅ |

---

## ⬜ Belum / Next Steps

### High Priority

#### Role-Based Access Control (RBAC) ✅
- [x] `UnauthorizedPage.tsx` — halaman akses ditolak, butang balik ke role home
- [x] `RoleRoute` component — guard per route, check `currentStaff.role` vs `allowedRoles[]`
- [x] `RoleHomeRedirect` — redirect `/` ke halaman utama berdasarkan role
- [x] `App.tsx` — setiap route ada `RoleRoute` dengan `allowedRoles` yang betul
- [x] Login redirect ikut role: kitchen → `/kitchen`, lain-lain → `/cashier`
- [x] Sidebar `roles` array konsisten dengan `RoleRoute` allowedRoles

#### Product Modifiers ✅
- [x] UI create/edit ModifierGroup (nama, type: single/multiple, required, min/max select)
- [x] UI create/edit ModifierOption (nama, harga tambahan)
- [x] Assign modifier groups ke product dalam MenuPage
- [x] Assign modifier groups ke **seluruh category** (semua produk dalam category auto-dapat modifier)
- [x] Modal pilih modifier bila tap product di CashierPage
- [x] Display modifier dalam cart item & order item
- [x] Hitung harga modifier dalam `totalPrice`

#### Printer Integration (ESC/POS via TCP/IP) ✅
- [x] Utility `src/lib/printer.ts` — HTML receipt/kitchen ticket builder + `window.print()`
- [x] Receipt template (nama restoran, items, modifiers, tax, total, footer)
- [x] Kitchen ticket template (orderNumber, meja, items + modifiers + note)
- [x] Trigger print receipt selepas payment (auto jika `receiptPrinter.enabled`)
- [x] Trigger print kitchen ticket bila sendToKitchen() (auto jika `kitchenPrinter.enabled`)
- [x] Test print button dalam SettingsPage (resit & tiket dapur sampel)
- [ ] Connect terus ke printer LAN via TCP socket (requires Capacitor Native TCP — Phase 7)

#### Waiter Tablet Mode ✅
- [x] Waiter home redirect → `/tables` (bukan `/cashier`)
- [x] TablesPage: tap kad meja → muat order sedia ada atau mulakan order Dine In baru → navigate ke Cashier
- [x] Delete button meja hanya untuk admin
- [x] Kad meja lebih besar (p-4, text-2xl) — sesuai untuk tablet

### Medium Priority

#### Order Management (improvements) ✅
- [x] Void order — OrdersPage: butang Void (admin/cashier), modal reason, update status `voided`, bebaskan meja
- [x] Discount per-order — CashierPage: input discount (RM flat) dalam totals, admin/cashier sahaja
- [x] Edit order yang dah sent_to_kitchen — sudah berfungsi: butang "Add" load order ke cart, item baru jadi `pending`, hantar KOT semula
- [x] Split bill (kalkulator pisah bil — Pro feature, tunjuk jumlah setiap orang)
- [ ] Void order dalam ReportsPage (history)
- [x] Discount percentage (RM flat + %)

#### Shift (improvements)
- [ ] Filter shift history by tarikh dalam StaffPage
- [ ] Cashier hanya nampak shift sendiri (bukan semua shift)
- [ ] Alert/warning kalau shift dah buka terlalu lama (> 12 jam)

#### Menu (improvements)
- [x] Product image upload (store sebagai base64 dalam IndexedDB, preview dalam MenuPage & CashierPage)
- [x] Drag-and-drop sort order untuk categories & products
- [x] Toggle product active/inactive (sold out) — butang toggle di MenuPage, CashierPage hide produk tidak aktif
- [x] Copy/duplicate product

#### Reports (improvements) ✅
- [x] Filter by date range — quick buttons: Hari Ini / Minggu Ini / Bulan Ini / Tersuai (calendar input)
- [x] Hourly sales chart (CSS bar chart, tiada library luaran)
- [x] Export to CSV (download file)
- [x] Sales by category breakdown
- [x] Monthly archive panel (sidebar kanan, klik bulan → auto set date range)
- [x] Shift filter dropdown (filter report by shift ID)

#### Shift Management ✅
- [x] `Shift` interface dalam `types/index.ts` (`cashFloat`, `closingCash`, `status`, etc.)
- [x] `shiftId?: string` ditambah pada `Order` interface
- [x] DB version 5 — table `shifts` dengan indexes: `status, openedById, openedAt, closedAt`
- [x] `src/store/shiftStore.ts` — Zustand persist store (`openShift`, `closeShift`, `loadCurrentShift`)
- [x] `loadCurrentShift()` dipanggil dalam `App.tsx` on startup (fallback jika localStorage di-clear)
- [x] `cartStore.ts` — `startOrder()` terima `shiftId` sebagai parameter ke-6
- [x] `TablesPage.tsx` — `startOrder()` pass `currentShift?.id`
- [x] `CashierPage.tsx` — warning banner "Tiada shift aktif", pass `shiftId` ke `startOrder()`
- [x] `StaffPage.tsx` — tab Shift (buka/tutup shift, sejarah shift, variance report)
- [x] Cashier boleh akses `/staff` (Shift tab sahaja, Staff CRUD disembunyikan)
- [x] Numeric keypad floating (trigger bila tap field) — sesuai untuk tablet/IMIN
- [x] Auto-round jangkaan ke RM penuh, kiraan cashier dibulatkan ke 5 sen
- [x] Variance report dalam table sejarah: Jualan, Jangkaan Tunai, Kiraan Tutup, Varians (colour-coded)

#### Table Management (improvements)
- [ ] Drag table layout (custom floor plan)
- [x] Merge tables (combine orders)
- [x] Transfer order ke table lain
- [x] Reservation dengan nama & masa

### Pre-Capacitor Gate (CrossxPos sahaja)

> Wajib jelas & disahkan sebelum mula `npx cap init`.

- [x] Finalize strategi printing mobile: Capacitor Android-first + native TCP/ESC-POS bridge untuk printer; guna `@capacitor-community/sqlite` untuk data mobile
- [x] Tetapkan routing station → printer untuk kitchen/cashier (dokumen + UI settings)
- [x] `index.html` tambah `viewport-fit=cover`
- [x] Root layout tambah safe-area inset padding (`env(safe-area-inset-*)`)
- [x] Putuskan UX mobile: responsive + bottom tab bar
- [x] Ujian manual flow penting di browser: login, cashier, KOT, kitchen, checkout, reports
- [x] Sahkan semua docs status selari dengan kod semasa (overview/todo/README)

### Low Priority / Future

#### Capacitor Setup
- [x] `npm install @capacitor/core @capacitor/cli`
- [x] `npx cap init`
- [x] `@capacitor/android` + `@capacitor/ios`
- [x] `@capacitor-community/sqlite` (replace IndexedDB untuk mobile)
- [ ] TCP socket plugin untuk printer (cth: `@ottimis/capacitor-socket`)
- [ ] Splash screen, app icon

#### Capacitor — Layout Preparation (buat sebelum wrap)
> Kena siap sebelum `npx cap add android`

**CSS / Meta:**
- [x] `index.html`: tambah `viewport-fit=cover` dalam meta viewport
- [x] Global CSS: tambah `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` pada root layout

**Navigation:**
- [x] Tukar sidebar kiri → **bottom tab bar** untuk skrin < `lg` (< 1024px)
- [ ] Pilihan A (mudah): Lock orientation landscape dalam `capacitor.config.ts` → `"orientation": "landscape"` — sidebar masih okay
- [x] Pilihan B (lebih baik): Responsive layout, sidebar hide pada md/sm, bottom nav muncul

**CashierPage pada tablet 8–9":**
- [ ] Landscape 1280×800: layout 3-panel masih okay ✅
- [ ] Portrait: cart perlu jadi slide-up panel (bottom sheet) — perlu redesign

#### Capacitor — Sasaran Peranti

**Cashier Station (fixed counter):**
- IMIN D1 / D3 (8"–15.6") — layout sekarang sesuai terus

**Staff Tablet (bawa jalan ambil order, bajet < RM 500):**

| Tablet | Saiz | RAM | Harga (~RM) | Catatan |
|---|---|---|---|---|
| **Redmi Pad SE** | 8.7" / 11" | 4–8GB | 350–480 | ✅ Terbaik nilai/harga, WiFi 5GHz |
| **Samsung Tab A9** | 8.7" | 4GB | 450–500 | ✅ Boleh dipercayai, banyak service center |
| **Lenovo Tab M9** | 9" | 4GB | 350–420 | ✅ Tahan lasak, bateri besar |
| **Realme Pad Mini** | 8.7" | 3GB | 300–380 | ⚠️ OK, build quality biasa |

> **Elak** tablet China tanpa nama dengan spec "16GB RAM + Mali-400 GPU" — spec palsu, tidak boleh dipercayai untuk persekitaran POS komersial.

#### Multi-device Sync
- [ ] Waiter tablets submit orders → masuk ke cashier queue secara real-time
- [ ] Option: WebSocket server (local WiFi) atau Supabase Realtime

#### Security
- [ ] Admin boleh lock/unlock access dengan master PIN
- [ ] Session timeout (auto-logout selepas idle X minit)
- [ ] Audit log (siapa buat apa, bila)

---

## Known Issues / Tech Debt

- `App.css` (default Vite file) masih ada, belum dibuang
- `src/assets/` masih ada default Vite assets
- `cartStore.ts`: `recalcTotals()` dipanggil dalam `processPayment` tapi tidak dikemaskini secara reactive — cart display di CashierPage kira semula inline (ok untuk sekarang)
- `OrderItemStatus`: `'preparing'` ada dalam types tapi KitchenPage tidak menggunakannya
- `Table.status` (`reserved`, `cleaning`) masih dalam type tapi TablesPage hanya tunjuk merah/hijau dari active orders
