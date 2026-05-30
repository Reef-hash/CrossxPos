# CrossxPOS

A modern, offline-first restaurant Point of Sale (POS) system built as a progressive web app — Capacitor-ready for Android/iOS packaging.

## Features

| Feature | Status |
|---|---|
| PIN-based staff login with role-based access | ✅ |
| POS cashier (dine-in / take-away, KOT, payment) | ✅ |
| Product modifiers (toppings, add-ons, sizes) | ✅ |
| Table management + waiter tablet mode | ✅ |
| Kitchen display (live order queue) | ✅ |
| Order management (void, discount, edit) | ✅ |
| Menu management (categories, products, modifiers) | ✅ |
| Staff management (roles, PIN) | ✅ |
| Settings tabs (Profile, Printer, License) | ✅ |
| Reports (date range, hourly chart, CSV export, sales by category) | ✅ |
| Receipt & kitchen ticket printing (`window.print()`) | ✅ |
| Station → printer routing setup (UI) | ✅ |
| Offline-first (IndexedDB — no internet required) | ✅ |
| License key system (HMAC-SHA256 offline verification) | ✅ |
| Role-Based Access Control (RBAC) | ✅ |

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 19 + Vite (TypeScript) |
| Styling | Tailwind CSS v4 |
| Routing | React Router v6 |
| State | Zustand (persist) |
| Database | Dexie.js v4 (IndexedDB) |
| Live Queries | dexie-react-hooks |
| Icons | Lucide React |
| Date utils | date-fns |

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## User Roles

| Role | Access |
|---|---|
| `admin` | All pages |
| `cashier` | Cashier, Orders, Kitchen, Tables |
| `waiter` | Cashier, Tables |
| `kitchen` | Kitchen only |

**Default admin PIN:** `1234`

Login with your 4-digit PIN. Role determines which pages you can access and which buttons are visible.

## License Key System

Generate license keys using the CLI script:

```bash
# Basic plan — 365 days
node scripts/generate-license.mjs --plan basic --restaurant "My Restaurant" --id LIC-0001

# Pro plan — 2 years
node scripts/generate-license.mjs --plan pro --restaurant "Restaurant XYZ" --id LIC-0002 --days 730
```

| Limit | Basic | Pro |
|---|---|---|
| Staff | 3 | 15 |
| Tables | 10 | Unlimited |
| Products | 50 | Unlimited |
| Void / Discount / Reports Export | ❌ | ✅ |

> ⚠️ Change `HMAC_SECRET` in `src/lib/license.ts` and `scripts/generate-license.mjs` before production deployment. Keep the repo private if the secret must remain confidential.

## Receipt Printing

Receipt and kitchen ticket printing uses `window.print()` with thermal-width HTML (72mm). To print directly to a LAN printer without the browser dialog, TCP/ESC-POS support via Capacitor is planned for Phase 7.

Enable auto-print in **Settings → Receipt Printer / Kitchen Printer → Enabled**.

## Roadmap

| Phase | Description | Status |
|---|---|---|
| 1 | Foundation + Core POS Flow | ✅ Done |
| 2 | License Key System (SaaS) | ✅ Done |
| 3 | RBAC + Waiter Tablet Mode + Order Management | ✅ Done |
| 4 | Printer Integration | ✅ Done |
| 5 | Reports Improvements | ✅ Done |
| 6 | Menu Improvements (image upload, sort, sold out, duplicate) | ✅ Done |
| 7 | Capacitor Setup (Android/iOS APK + TCP printing) | ⬜ Planned |
| 8 | Multi-device Sync (waiter tablets real-time) | ⬜ Planned |

## Project Structure

```
src/
├── lib/          # Utilities: utils, license verification, printer
├── store/        # Zustand stores: auth, cart, settings, license
├── db/           # Dexie IndexedDB schema + seed data
├── types/        # TypeScript interfaces
├── components/   # Reusable UI components + layout
└── pages/        # Route pages (cashier, kitchen, tables, reports…)

docs/             # Architecture, todo backlog, type reference
scripts/          # License key generator CLI
```
