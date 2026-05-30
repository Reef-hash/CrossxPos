# CrossxPOS — Project Overview

Restaurant POS web app (Capacitor-ready). Offline-first, runs sepenuhnya di browser / device tanpa internet connection.

## Tech Stack

| Layer | Library / Tool |
|---|---|
| Framework | React 19 + Vite (TypeScript) |
| Styling | Tailwind CSS v4 + shadcn/ui (manual) |
| Routing | React Router v6 |
| State | Zustand (persist middleware) |
| Database | Dexie.js (IndexedDB, offline-first) |
| Live Queries | dexie-react-hooks (`useLiveQuery`) |
| Icons | Lucide React |
| Mobile Wrap | Capacitor (belum setup) |

## User Roles

| Role | Akses |
|---|---|
| `admin` | Semua pages |
| `cashier` | Cashier, Orders, Kitchen, Tables |
| `waiter` | Cashier, Tables |
| `kitchen` | Kitchen sahaja |

> **RBAC** dikuatkuasakan di peringkat route (`RoleRoute` guard) dan di Sidebar (filter nav item). Login redirect ke halaman utama berdasarkan role.

Login menggunakan **PIN 4 digit**. Default admin: PIN `1234`.

## Status Ringkas

| Feature | Status |
|---|---|
| Auth (PIN login) | ✅ Siap |
| Cashier (KOT flow) | ✅ Siap |
| Table Management | ✅ Siap |
| Kitchen Display | ✅ Siap |
| Menu Management | ✅ Siap |
| Product Modifiers | ✅ Siap |
| Category Modifiers | ✅ Siap |
| Orders (active queue) | ✅ Siap |
| Void Order + Discount | ✅ Siap |
| Reports (daily + monthly archive + shift filter) | ✅ Siap |
| Staff Management | ✅ Siap |
| Settings (profile/printer/license tabs) | ✅ Siap |
| License Key System | ✅ Siap |
| Role-Based Access (RBAC) | ✅ Siap |
| Waiter Tablet Mode | ✅ Siap |
| Printer (ESC/POS) | ✅ Siap (window.print() + station-printer routing UI; TCP native via Capacitor belum) |
| Reports Improvements | ✅ Siap |
| **Shift Management** | ✅ Siap |
| Menu Improvements | ✅ Siap (image, sort, sold out, duplicate) |
| Capacitor Setup | ⬜ Belum |
| Multi-device Sync | 📋 Dirancang (lihat PLAN-MULTIDEVICE.md) |

Rujuk [architecture.md](./architecture.md) untuk detail teknikal, [todo.md](./todo.md) untuk backlog, dan [PLAN-MULTIDEVICE.md](./PLAN-MULTIDEVICE.md) untuk pelan multi-device sync.

## Roadmap Fasa

| Fasa | Tajuk | Status |
|---|---|---|
| 1 | Foundation + Core POS Flow | ✅ Siap |
| 2 | License Key System (SaaS) | ✅ Siap |
| 3 | RBAC + Waiter Tablet Mode + Order Management | ✅ Siap |
| 4 | Printer Integration (ESC/POS via TCP) | ✅ Siap (window.print() — TCP Phase 7) |
| 5 | Reports Improvements (date range, chart, export, monthly archive) | ✅ Siap |
| 5b | Shift Management (open/close, variance report, tablet keypad) | ✅ Siap |
| 6 | Menu Improvements (image ✅, sort ✅, sold out ✅, duplicate ✅) | ✅ Siap |
| 7 | Capacitor Setup (Android/iOS APK) | ⬜ Belum |
| 8a | Multi-device Sync — Supabase Realtime | 📋 Dirancang |
| 8b | Multi-device Sync — Offline Resilience | ⬜ Belum |
| 8c | Multi-device Sync — Local WebSocket Hub | ⬜ Belum |

> Detail item setiap fasa ada dalam [todo.md](./todo.md).
