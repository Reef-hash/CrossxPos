# CrossxPOS — Multi-Device Architecture Plan

> **Status:** Perancangan (belum implement)
> **Fasa:** 8 (rujuk overview.md)
> **Keutamaan:** Tinggi — isu kritikal untuk deployment sebenar

---

## 1. Gambaran Bisnes (Real-World Scenario)

### Cara deployment CrossxPOS di restoran

```
[IMIN / Android Tablet — Cashier]     [Android Tablet — Waiter 1]
  Rol: Cashier / Admin                   Rol: Waiter
  - Proses bayaran                       - Ambil order dari customer
  - Lihat semua order                    - Hantar KOT ke dapur
  - Manage meja                          - Lihat status meja

[Android Tablet — Waiter 2]            [Kitchen Display / Tablet]
  Rol: Waiter                             Rol: Kitchen
  - Ambil order dari customer            - Lihat order masuk
  - Hantar KOT ke dapur                  - Mark order siap
```

### Flow order yang diharapkan

```
1. Customer duduk di Meja 5
2. Waiter (tablet) → buka Meja 5 → ambil order → KOT
3. Kitchen (display) → terima order Meja 5 → prepare
4. Customer minta bil → pergi ke cashier → sebut "Meja 5"
5. Cashier (IMIN) → cari Order Meja 5 → terus checkout → bayar
```

### Masalah sekarang

```
❌ Semua data dalam IndexedDB — local per device
❌ Order yang waiter buat di tablet dia TIDAK muncul di cashier tablet
❌ Kitchen display tidak nampak order dari waiter tablet lain
```

---

## 2. Analisis Pilihan Arkitektur

### Pilihan A: Supabase Realtime (Cloud)

```
[Waiter Tablet] ──── HTTPS/WS ────► [Supabase Cloud] ◄──── HTTPS/WS ──── [Cashier IMIN]
                                           │
                                    [Kitchen Display]
```

| | |
|---|---|
| ✅ Mudah implement | Dexie → Supabase client swap |
| ✅ Realtime built-in | Supabase Realtime (WebSocket) |
| ✅ Cross-network | Boleh guna data mobile jika perlu |
| ✅ Free tier cukup | ~500 concurrent users, 500MB DB |
| ❌ Perlu internet | Jika WiFi putus, sistem berhenti |
| ❌ Latency | Bergantung pada internet |
| ❌ Privacy | Data keluar dari restoran ke cloud |

### Pilihan B: Local WebSocket Hub (LAN Only)

```
[Waiter Tablet] ──── WiFi LAN ────► [IMIN "Hub"] ◄──── WiFi LAN ──── [Kitchen Display]
                                    SQLite + WS Server
```

| | |
|---|---|
| ✅ Fully offline | Internet tidak diperlukan langsung |
| ✅ Laju | Dalam LAN < 5ms |
| ✅ Data privasi | Semua data dalam premis restoran |
| ❌ Kompleks | Perlu native plugin (Capacitor Node.js) |
| ❌ IMIN mesti ON | Hub device kena selalu aktif |
| ❌ IP setup | Perlu set static IP untuk IMIN |

### Pilihan C: Hybrid (Diutamakan ✅)

```
Fasa 8a: Supabase Realtime (cepat deploy, cross-device)
Fasa 8b: Local WebSocket fallback (bila Supabase unreachable)
```

Bermula dengan **Supabase** kerana:
- Boleh implement dalam masa lebih singkat
- Cukup untuk majoriti restoran (ada WiFi)
- Supabase ada offline support dengan `supabase-js` + optimistic updates
- Boleh migrate ke local server kemudian tanpa ubah UI

---

## 3. Arkitektur Sasaran (Fasa 8a — Supabase)

### Lapisan data baru

```
┌─────────────────────────────────────────────────┐
│  Device Layer (setiap tablet)                   │
│                                                 │
│  React UI                                       │
│    │                                            │
│    ├── Zustand Store (in-memory)                │
│    │      │                                     │
│    │      ├── IndexedDB/Dexie (offline cache)   │
│    │      │                                     │
│    │      └── Supabase Client (sync layer)      │
│    │              │         ▲                   │
│    │         INSERT/UPDATE  │ Realtime WS       │
│    │              │         │                   │
└────────────────────┼─────────┼───────────────────┘
                     ▼         │
              ┌──────────────────────┐
              │   Supabase Cloud     │
              │   PostgreSQL DB      │
              │   Realtime Engine    │
              └──────────────────────┘
```

### Device Mode

Setiap device akan ada **Device Mode** dalam Settings:

```ts
type DeviceMode = 'standalone'  // current behaviour, IndexedDB only
               | 'hub'          // cashier IMIN — boleh lihat semua
               | 'client'       // waiter/kitchen — sync ke hub
```

---

## 4. Perubahan Schema Database

### Jadual Supabase (PostgreSQL)

#### `restaurants` — satu rekod per license
```sql
id          UUID PRIMARY KEY
license_key TEXT UNIQUE NOT NULL
name        TEXT NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
```

#### `staff` — sync dari local
```sql
id              UUID PRIMARY KEY
restaurant_id   UUID REFERENCES restaurants(id)
name            TEXT NOT NULL
pin             TEXT NOT NULL  -- hashed (bcrypt)
role            TEXT NOT NULL  -- admin|cashier|waiter|kitchen
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
```

#### `orders` — jadual utama sync
```sql
id              UUID PRIMARY KEY
restaurant_id   UUID REFERENCES restaurants(id)
order_number    TEXT NOT NULL
type            TEXT NOT NULL       -- dine_in|takeaway
table_id        UUID
table_number    TEXT
staff_id        UUID
staff_name      TEXT
status          TEXT NOT NULL       -- open|sent_to_kitchen|ready|paid|cancelled|voided
items           JSONB NOT NULL      -- OrderItem[]
subtotal        NUMERIC(10,2)
tax             NUMERIC(10,2)
discount        NUMERIC(10,2) DEFAULT 0
discount_type   TEXT                -- flat|percent
discount_value  NUMERIC(10,2) DEFAULT 0
total           NUMERIC(10,2)
payment_method  TEXT                -- cash|card|qr
amount_paid     NUMERIC(10,2)
change          NUMERIC(10,2)
note            TEXT
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
paid_at         TIMESTAMPTZ
```

#### `tables` — sync dari local
```sql
id              UUID PRIMARY KEY
restaurant_id   UUID REFERENCES restaurants(id)
number          TEXT NOT NULL
capacity        INT DEFAULT 4
status          TEXT DEFAULT 'available'
current_order_id UUID
section         TEXT
```

### Perubahan Dexie (IndexedDB) — kekal sebagai offline cache

- Schema Dexie tidak berubah
- Tambah field `synced_at` pada `orders` untuk track sync status
- `syncStatus: 'pending' | 'synced' | 'conflict'`

---

## 5. Sync Strategy

### Prinsip utama

```
1. Local first  — tulis ke IndexedDB dahulu (optimistic)
2. Sync async   — hantar ke Supabase dalam background
3. Realtime sub — subscribe update dari device lain
4. Conflict     — last-write-wins untuk order status
                  (order hanya boleh maju status, tidak boleh undur)
```

### Order lifecycle (multi-device)

```
[Waiter Tablet]                    [Supabase]              [Cashier IMIN]
     │                                  │                        │
     │── startOrder() ──────────────────┼──── INSERT order ─────►│ (realtime)
     │                                  │                        │
     │── addItem() ─────────────────────┼──── UPDATE items ─────►│ (realtime)
     │                                  │                        │
     │── sendToKitchen() ───────────────┼──── status update ────►│ + Kitchen
     │                                  │                        │
     │                                  │◄─── Cashier: PAID ─────│
     │◄─── order.status = 'paid' ───────│                        │
```

### Conflict resolution

```
Status order hanya boleh maju (irreversible):
open → sent_to_kitchen → ready → paid
               ↓
            voided

Jika dua device update serentak:
- Status yang "lebih maju" menang
- Items: merge (tambah item baru, jangan padam yang lama)
- Amount: cashier device yang process payment = final
```

---

## 6. Komponen Baru yang Diperlukan

### A. `src/lib/supabase.ts`
```ts
// Supabase client initialization
// Environment variable: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

### B. `src/lib/sync.ts`
```ts
// SyncManager class
// - syncOrder(order) → upsert ke Supabase
// - subscribeOrders(restaurantId, callback) → realtime listener
// - syncStaff(), syncTables()
// - resolveConflict(local, remote) → Order
```

### C. `src/store/syncStore.ts`
```ts
// Zustand store
// - syncStatus: 'online' | 'offline' | 'syncing' | 'error'
// - pendingSync: number (bilangan rekod belum sync)
// - lastSyncAt: Date | null
// - deviceMode: DeviceMode
// - restaurantId: string | null
```

### D. `src/hooks/useRealtimeOrders.ts`
```ts
// Custom hook
// - Subscribe Supabase realtime untuk orders
// - Auto-update IndexedDB + Zustand bila ada perubahan dari device lain
// - Handle reconnect bila WiFi putus
```

### E. Perubahan `settingsStore.ts`
```ts
// Tambah:
// - deviceMode: DeviceMode
// - supabaseRestaurantId: string | null
// - syncEnabled: boolean
```

### F. Perubahan `SettingsPage.tsx`
```tsx
// Tambah section "Tetapan Sync":
// - Toggle sync on/off
// - Pilih device mode (Standalone / Hub / Client)
// - Status indicator (● Online / ● Offline / ● Syncing)
// - Manual sync button
```

---

## 7. Indicator Status Sync (UI)

### Sidebar — status dot

```
● Online   (hijau)
● Offline  (kuning) — data disimpan, akan sync bila online
● Syncing  (biru berputar)
● Error    (merah) — tap untuk lihat details
```

### Order card — sync badge

```
[Order #0042]  [✓ Synced]
[Order #0043]  [⟳ Pending]
[Order #0044]  [⚠ Conflict]
```

---

## 8. Fasa Implementasi

### Fasa 8a — Supabase Foundation (Target: ~2 minggu)

```
[ ] Setup projek Supabase
    [ ] Cipta projek baru di supabase.com
    [ ] Setup schema SQL (restaurants, staff, orders, tables)
    [ ] Enable Realtime untuk table: orders, tables
    [ ] Row Level Security (RLS) — filter by restaurant_id
    [ ] Generate anon key + URL

[ ] Supabase client dalam CrossxPOS
    [ ] npm install @supabase/supabase-js
    [ ] .env setup (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
    [ ] src/lib/supabase.ts — createClient()

[ ] Restaurant registration (link license → Supabase)
    [ ] Bila license diaktifkan → register restaurant di Supabase
    [ ] Simpan restaurant_id dalam licenseStore / settingsStore

[ ] Order sync
    [ ] cartStore.sendToKitchen() → sync ke Supabase
    [ ] cartStore.processPayment() → sync ke Supabase
    [ ] Realtime subscription → update IndexedDB + UI

[ ] Settings UI — device mode & sync status
    [ ] Toggle sync on/off
    [ ] Device mode selector
    [ ] Sync status indicator
```

### Fasa 8b — Offline Resilience (Target: ~1 minggu)

```
[ ] Offline queue
    [ ] Detect online/offline (navigator.onLine + event listener)
    [ ] Queue operations bila offline
    [ ] Auto-flush queue bila online semula
    [ ] Conflict detection & resolution

[ ] Sync indicator dalam UI
    [ ] Status dot dalam Sidebar
    [ ] Pending count badge
    [ ] Notification bila conflict
```

### Fasa 8c — Local WebSocket (Future, ~3 minggu)

```
[ ] Capacitor + capacitor-nodejs plugin
[ ] Hub device: Node.js server (Express + ws)
[ ] Client device: connect by IP
[ ] Fallback: guna Supabase jika hub unreachable
```

---

## 9. Security Considerations

### Row Level Security (Supabase RLS)

```sql
-- Setiap restaurant hanya boleh baca data sendiri
CREATE POLICY "Restaurant isolation"
ON orders FOR ALL
USING (restaurant_id = current_setting('app.restaurant_id')::UUID);
```

### PIN hashing

- Sekarang PIN disimpan plain text dalam IndexedDB (ok untuk local)
- Untuk Supabase: PIN mesti di-hash (bcrypt) sebelum simpan
- **Jangan hantar PIN plain text ke cloud**

### Anon key exposure

- `VITE_SUPABASE_ANON_KEY` akan terdedah dalam bundle JS
- Ini normal untuk Supabase — anon key hanya boleh buat apa yang RLS benarkan
- Pastikan RLS dikuatkuasakan untuk semua table

---

## 10. Lain-lain Features Belum Implement

Selain multi-device sync, ini adalah backlog features mengikut keutamaan:

### 🔴 Tinggi
| Feature | Nota |
|---|---|
| PWA / Service Worker | Cache asset untuk full offline load |
| Capacitor Android build | APK untuk IMIN & tablet |
| TCP Printer (Capacitor) | Direct print ke ESC/POS printer tanpa dialog |
| Split Bill | Bahagi order antara beberapa pelanggan |

### 🟡 Sederhana
| Feature | Nota |
|---|---|
| Product image upload | Store sebagai blob dalam IndexedDB |
| Sold out toggle | Toggle active/inactive produk cepat |
| Table floor plan | Drag layout meja |
| Transfer table | Pindah order ke meja lain |
| Session timeout | Auto-logout selepas idle |
| Audit log | Rekod siapa buat apa |

### 🟢 Rendah
| Feature | Nota |
|---|---|
| Reservation system | Booking meja dengan nama & masa |
| Loyalty points | Sistem mata pelanggan tetap |
| Inventory tracking | Stok bahan |
| Multi-language | BM / EN / CN |

---

## 11. Keputusan Teknikal yang Perlu Dibuat

Sebelum mula implement, perlu keputusan muktamad untuk:

1. **Sync backend**: Supabase vs self-hosted (Supabase dicadangkan ✅)
2. **PIN storage**: Hash di device sebelum sync, atau trust local PIN? (Hash dicadangkan ✅)
3. **Conflict resolution**: Last-write-wins vs manual resolve? (Auto untuk status, manual untuk amount ✅)
4. **Offline mode**: Boleh operate sepenuhnya tanpa sync? (Ya — IndexedDB tetap jadi source of truth local ✅)
5. **License → Restaurant ID**: Link license key ke Supabase restaurant record semasa activation? (Ya ✅)

---

## Rujukan

- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime)
- [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Capacitor Node.js plugin](https://github.com/hampoelz/Capacitor-NodeJS)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [Dexie.js + Supabase sync pattern](https://dexie.org/docs/syncable/Dexie.Syncable.js)

---

*Dokumen ini perlu dikemaskini setiap kali keputusan teknikal diubah atau fasa baru dimulakan.*
