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
- [ ] Split bill (bahagi bayaran antara beberapa customers)
- [ ] Void order dalam ReportsPage (history)
- [ ] Discount percentage (kini hanya flat RM)

#### Menu (improvements)
- [ ] Product image upload (store sebagai base64 atau IndexedDB blob)
- [ ] Drag-and-drop sort order untuk categories & products
- [ ] Toggle product active/inactive (sold out)
- [ ] Copy/duplicate product

#### Reports (improvements) ✅
- [x] Filter by date range — quick buttons: Hari Ini / Minggu Ini / Bulan Ini / Tersuai (calendar input)
- [x] Hourly sales chart (CSS bar chart, tiada library luaran)
- [x] Export to CSV (download file)
- [x] Sales by category breakdown

#### Table Management (improvements)
- [ ] Drag table layout (custom floor plan)
- [ ] Merge tables (combine orders)
- [ ] Transfer order ke table lain
- [ ] Reservation dengan nama & masa

### Low Priority / Future

#### Capacitor Setup
- [ ] `npm install @capacitor/core @capacitor/cli`
- [ ] `npx cap init`
- [ ] `@capacitor/android` + `@capacitor/ios`
- [ ] `@capacitor-community/sqlite` (replace IndexedDB untuk mobile)
- [ ] TCP socket plugin untuk printer (cth: `@ottimis/capacitor-socket`)
- [ ] Splash screen, app icon

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
