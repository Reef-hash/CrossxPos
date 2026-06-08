/**
 * CrossxPOS — Print Utility
 *
 * Two print paths:
 *  1. TCP/ESC-POS (preferred) — sends raw bytes to LAN/WiFi printer via the
 *     local print bridge (scripts/print-bridge.mjs).  No browser dialog.
 *     Falls back to window.print() automatically if bridge is not running.
 *  2. window.print() (fallback) — opens a pop-up with thermal-width HTML.
 *
 * To enable direct WiFi printing:
 *  a) Run:  npm run bridge  (in a second terminal)
 *  b) In Settings → Printer, tick Enabled and enter the printer IP.
 */

import type { Order, AppSettings } from '@/types'
import { buildKitchenEscPos, buildReceiptEscPos } from '@/lib/escpos'

// ─── Print Bridge ─────────────────────────────────────────────────────────────

const BRIDGE_URL = 'http://127.0.0.1:6100/print'

/** Encode Uint8Array to base64 without spread (safe for large buffers). */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Sends ESC/POS bytes to the local print bridge, which forwards them via TCP
 * to the printer at ip:port.
 * Throws if bridge is unreachable or returns an error.
 */
async function sendViaBridge(ip: string, port: number, bytes: Uint8Array): Promise<void> {
  const resp = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, port, data: toBase64(bytes) }),
    signal: AbortSignal.timeout(8000),
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error((body as { error?: string }).error ?? `HTTP ${resp.status}`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rm(n: number): string {
  return `RM ${n.toFixed(2)}`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Receipt HTML ─────────────────────────────────────────────────────────────

function buildReceiptHTML(order: Order, settings: AppSettings): string {
  const date = new Date(order.paidAt ?? order.createdAt)
  const dateStr = date.toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })

  const itemsHTML = order.items
    .map((item) => {
      const mods = item.modifiers.length
        ? `<div class="sm">${item.modifiers
            .map((m) => `+ ${esc(m.optionName)}${m.price > 0 ? ` (+${rm(m.price)})` : ''}`)
            .join(' | ')}</div>`
        : ''
      const note = item.note ? `<div class="sm italic">⚠ ${esc(item.note)}</div>` : ''
      return `<div class="row"><span>${item.quantity}× ${esc(item.productName)}</span><span>${rm(item.totalPrice)}</span></div>${mods}${note}`
    })
    .join('')

  const discount = order.discount ?? 0

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Resit</title><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Courier New', monospace; font-size: 11px; width: 280px; padding: 6px 8px; }
.center { text-align: center; }
h2 { font-size: 14px; }
.dash { border-top: 1px dashed #000; margin: 5px 0; }
.row { display: flex; justify-content: space-between; margin: 2px 0; }
.sm { font-size: 10px; padding-left: 10px; color: #444; }
.italic { font-style: italic; }
.bold { font-weight: bold; }
.lg { font-size: 13px; font-weight: bold; }
@media print { @page { margin: 0; size: 72mm auto; } body { width: 72mm; } }
</style></head><body>
<div class="center">
  <h2>${esc(settings.restaurantName)}</h2>
  <div>${dateStr} ${timeStr}</div>
  <div>Order #${order.orderNumber}</div>
  <div>${order.type === 'dine_in' ? `Dine In · Meja ${esc(order.tableNumber ?? '')}` : 'Take Away'}</div>
  <div>Cashier: ${esc(order.staffName)}</div>
</div>
<div class="dash"></div>
${itemsHTML}
<div class="dash"></div>
<div class="row"><span>Subtotal</span><span>${rm(order.subtotal)}</span></div>
<div class="row"><span>Tax (${settings.taxRate}%)</span><span>${rm(order.tax)}</span></div>
${discount > 0 ? `<div class="row"><span>Diskaun</span><span>-${rm(discount)}</span></div>` : ''}
<div class="dash"></div>
<div class="row lg"><span>JUMLAH</span><span>${rm(order.total)}</span></div>
<div class="row"><span>Bayaran</span><span class="bold" style="text-transform:capitalize">${esc(order.paymentMethod ?? '-')}</span></div>
${
  order.paymentMethod === 'cash' && order.amountPaid != null
    ? `<div class="row"><span>Tunai</span><span>${rm(order.amountPaid)}</span></div>
<div class="row"><span>Baki</span><span>${rm(order.change ?? 0)}</span></div>`
    : ''
}
<div class="dash"></div>
<div class="center" style="margin-top:4px; font-size:10px">${esc(settings.receiptFooter || 'Terima kasih atas kunjungan anda!')}</div>
</body></html>`
}

// ─── Kitchen Ticket HTML ──────────────────────────────────────────────────────

function buildKitchenHTML(order: Order, stationName?: string): string {
  const timeStr = new Date().toLocaleTimeString('ms-MY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const itemsHTML = order.items
    .map((item) => {
      const mods = item.modifiers
        .map((m) => `<div class="mod">+ ${esc(m.optionName)}</div>`)
        .join('')
      const note = item.note ? `<div class="mod note">⚠ ${esc(item.note)}</div>` : ''
      return `<div class="item"><div class="row"><b>${item.quantity}×</b> ${esc(item.productName)}</div>${mods}${note}</div>`
    })
    .join('<div class="line"></div>')

  const headerTitle = stationName ? `── ${esc(stationName.toUpperCase())} ──` : '── KITCHEN ORDER ──'

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen Order</title><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Courier New', monospace; font-size: 14px; width: 280px; padding: 6px 8px; }
.hdr { text-align: center; border-bottom: 3px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
.big { font-size: 28px; font-weight: bold; line-height: 1.1; }
.med { font-size: 18px; font-weight: bold; }
.row { margin: 5px 0; }
.mod { font-size: 11px; padding-left: 18px; }
.note { font-weight: bold; font-style: italic; }
.line { border-top: 1px dashed #000; margin: 6px 0; }
.item { margin: 8px 0; }
@media print { @page { margin: 0; size: 72mm auto; } body { width: 72mm; } }
</style></head><body>
<div class="hdr">
  <div>${headerTitle}</div>
  <div class="big">#${order.orderNumber}</div>
  <div class="med">${order.type === 'dine_in' ? `MEJA ${esc(order.tableNumber ?? '')}` : 'TAKE AWAY'}</div>
  <div>${timeStr}</div>
</div>
${itemsHTML}
</body></html>`
}

// ─── Sample Data (for Test Print) ────────────────────────────────────────────

function sampleOrder(): Order {
  return {
    id: 'demo',
    orderNumber: 9999,
    type: 'dine_in',
    tableId: 'demo-table',
    tableNumber: 'T3',
    staffId: 'demo-staff',
    staffName: 'Admin',
    items: [
      {
        id: '1',
        productId: 'p1',
        productName: 'Nasi Lemak Ayam',
        price: 9.5,
        quantity: 2,
        modifiers: [],
        status: 'served',
        totalPrice: 19.0,
      },
      {
        id: '2',
        productId: 'p2',
        productName: 'Teh Tarik',
        price: 2.5,
        quantity: 2,
        modifiers: [
          {
            modifierGroupId: 'g1',
            modifierGroupName: 'Suhu',
            optionId: 'o1',
            optionName: 'Panas',
            price: 0,
          },
        ],
        status: 'served',
        totalPrice: 5.0,
        note: 'Kurang manis',
      },
    ],
    status: 'paid',
    subtotal: 24.0,
    tax: 1.44,
    discount: 0,
    total: 25.44,
    paymentMethod: 'cash',
    amountPaid: 30.0,
    change: 4.56,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidAt: new Date(),
  }
}

// ─── Print Window ─────────────────────────────────────────────────────────────

function openPrintWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank', 'width=420,height=620,scrollbars=yes')
  if (!w) {
    alert('Pop-up disekat oleh pelayar.\nSila benarkan pop-up untuk fungsi cetak.')
    URL.revokeObjectURL(url)
    return
  }
  w.addEventListener('load', () => {
    URL.revokeObjectURL(url)
    w.print()
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cetak resit pelanggan selepas pembayaran.
 * Cuba TCP bridge dahulu (jika receiptPrinter.enabled dan IP ada),
 * fallback ke window.print() jika bridge tidak running.
 */
export function printReceipt(order: Order, settings: AppSettings): void {
  const { receiptPrinter } = settings
  if (receiptPrinter.enabled && receiptPrinter.ip) {
    const bytes = buildReceiptEscPos(order, settings)
    sendViaBridge(receiptPrinter.ip, receiptPrinter.port, bytes).catch(() => {
      // Bridge not running — fall back to browser print dialog
      openPrintWindow(buildReceiptHTML(order, settings))
    })
  } else {
    openPrintWindow(buildReceiptHTML(order, settings))
  }
}

/**
 * Cetak tiket dapur semasa KOT (Kitchen Order Ticket).
 * Jika item ada stesen berbeza, print slip berasingan per stesen.
 * Cuba TCP bridge dahulu (kitchenPrinter.enabled + IP), fallback ke window.print().
 * Jika stesen ada mapping ke printer profile, guna IP profile tersebut.
 */
export function printKitchenTicket(order: Order, settings: AppSettings): void {
  const { kitchenPrinter, printerProfiles, stationPrinterMap } = settings

  // Group items by kitchenStation
  const groups = new Map<string, typeof order.items>()
  order.items.forEach((item) => {
    const station = item.kitchenStation ?? ''
    const existing = groups.get(station) ?? []
    existing.push(item)
    groups.set(station, existing)
  })

  const tryBridge = kitchenPrinter.enabled && Boolean(kitchenPrinter.ip)

  // window.print() fallback needs staggered delay to avoid overlapping dialogs
  let delay = 0
  groups.forEach((items, station) => {
    const stationOrder = { ...order, items }
    const stationName  = station || undefined

    if (tryBridge) {
      // Resolve printer IP: prefer station-mapped profile, else legacy kitchenPrinter
      const mappedProfileId = (stationPrinterMap ?? {})[station]
      const profile = mappedProfileId
        ? (printerProfiles ?? []).find((p) => p.id === mappedProfileId)
        : null
      const printerIp   = profile?.ip   ?? kitchenPrinter.ip
      const printerPort = profile?.port ?? kitchenPrinter.port

      const bytes = buildKitchenEscPos(stationOrder, stationName)
      sendViaBridge(printerIp, printerPort, bytes).catch(() => {
        openPrintWindow(buildKitchenHTML(stationOrder, stationName))
      })
    } else {
      setTimeout(() => openPrintWindow(buildKitchenHTML(stationOrder, stationName)), delay)
      delay += 800
    }
  })
}

/**
 * Test print — resit sampel menggunakan tetapan semasa.
 * Guna TCP bridge jika receiptPrinter.enabled dan IP ada.
 */
export function testPrintReceipt(settings: AppSettings): void {
  const { receiptPrinter } = settings
  const sample = sampleOrder()
  if (receiptPrinter.enabled && receiptPrinter.ip) {
    const bytes = buildReceiptEscPos(sample, settings)
    sendViaBridge(receiptPrinter.ip, receiptPrinter.port, bytes).catch(() => {
      openPrintWindow(buildReceiptHTML(sample, settings))
    })
  } else {
    openPrintWindow(buildReceiptHTML(sample, settings))
  }
}

/**
 * Test print — tiket dapur sampel menggunakan tetapan semasa.
 * Guna TCP bridge jika kitchenPrinter.enabled dan IP ada.
 */
export function testPrintKitchen(settings: AppSettings): void {
  const { kitchenPrinter } = settings
  const sample: Order = {
    ...sampleOrder(),
    status: 'sent_to_kitchen',
    items: sampleOrder().items.map((i) => ({ ...i, status: 'pending' })),
  }
  if (kitchenPrinter.enabled && kitchenPrinter.ip) {
    const bytes = buildKitchenEscPos(sample)
    sendViaBridge(kitchenPrinter.ip, kitchenPrinter.port, bytes).catch(() => {
      openPrintWindow(buildKitchenHTML(sample))
    })
  } else {
    openPrintWindow(buildKitchenHTML(sample))
  }
}
