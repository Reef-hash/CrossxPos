/**
 * CrossxPOS — ESC/POS Byte Builder
 *
 * Builds raw ESC/POS byte sequences for thermal printers.
 * Used with the local print bridge (scripts/print-bridge.mjs) for
 * direct WiFi/LAN printing without a browser print dialog.
 *
 * Compatible with standard ESC/POS printers (Epson, Xprinter, GOOJPRT, etc.)
 * Target paper: 80mm (42-char line at normal font)
 */

import type { Order, AppSettings } from '@/types'

// ─── ESC/POS Command Constants ────────────────────────────────────────────────

const ESC = 0x1b
const GS  = 0x1d

const ESC_INIT         = [ESC, 0x40]          // Initialise printer
const ESC_ALIGN_LEFT   = [ESC, 0x61, 0x00]    // Left align
const ESC_ALIGN_CENTER = [ESC, 0x61, 0x01]    // Center align
const ESC_BOLD_ON      = [ESC, 0x45, 0x01]    // Bold on
const ESC_BOLD_OFF     = [ESC, 0x45, 0x00]    // Bold off
const ESC_FONT_TALL    = [GS,  0x21, 0x01]    // Double height
const ESC_FONT_BIG     = [GS,  0x21, 0x11]    // Double width + double height
const ESC_FONT_NORMAL  = [GS,  0x21, 0x00]    // Normal font size
const LF               = [0x0a]               // Line feed
const CUT              = [GS,  0x56, 0x41, 0x03]  // Partial cut + feed

const LINE_WIDTH = 42  // characters per 80mm line at normal font

// ─── Internal Builder ─────────────────────────────────────────────────────────

class EscPosDoc {
  private readonly buf: number[] = []
  private readonly enc = new TextEncoder()

  append(bytes: number[]): this { this.buf.push(...bytes); return this }
  text(s: string): this         { this.buf.push(...this.enc.encode(s)); return this }
  lf(): this                    { this.buf.push(...LF); return this }

  center(s: string): this {
    return this.append(ESC_ALIGN_CENTER).text(s).lf().append(ESC_ALIGN_LEFT)
  }

  centerBold(s: string): this {
    return this
      .append(ESC_ALIGN_CENTER)
      .append(ESC_BOLD_ON).text(s).append(ESC_BOLD_OFF)
      .lf().append(ESC_ALIGN_LEFT)
  }

  centerBig(s: string): this {
    return this
      .append(ESC_ALIGN_CENTER)
      .append(ESC_FONT_BIG).text(s).append(ESC_FONT_NORMAL)
      .lf().append(ESC_ALIGN_LEFT)
  }

  centerTall(s: string): this {
    return this
      .append(ESC_ALIGN_CENTER)
      .append(ESC_FONT_TALL).text(s).append(ESC_FONT_NORMAL)
      .lf().append(ESC_ALIGN_LEFT)
  }

  divider(): this {
    return this.text('-'.repeat(LINE_WIDTH)).lf()
  }

  row(left: string, right: string, bold = false): this {
    const gap  = Math.max(1, LINE_WIDTH - left.length - right.length)
    const line = left + ' '.repeat(gap) + right
    if (bold) this.append(ESC_BOLD_ON)
    this.text(line).lf()
    if (bold) this.append(ESC_BOLD_OFF)
    return this
  }

  build(): Uint8Array { return new Uint8Array(this.buf) }
}

// ─── Kitchen Ticket ───────────────────────────────────────────────────────────

/**
 * Builds ESC/POS bytes for a kitchen order ticket (KOT).
 * Large order number + table + bold item list — no prices.
 */
export function buildKitchenEscPos(order: Order, stationName?: string): Uint8Array {
  const timeStr = new Date().toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const doc = new EscPosDoc()
  doc.append(ESC_INIT).lf()

  // Header
  const title = stationName
    ? `-- ${stationName.toUpperCase()} --`
    : '-- KITCHEN ORDER --'
  doc.centerBold(title)
  doc.centerBig(`#${order.orderNumber}`)
  doc.centerTall(order.type === 'dine_in' ? `MEJA ${order.tableNumber ?? ''}` : 'TAKE AWAY')
  doc.center(timeStr)
  doc.divider()

  // Items
  for (const item of order.items) {
    doc.append(ESC_BOLD_ON).text(`${item.quantity}x ${item.productName}`).append(ESC_BOLD_OFF).lf()
    for (const mod of item.modifiers) {
      doc.text(`   + ${mod.optionName}`).lf()
    }
    if (item.note) {
      doc.append(ESC_BOLD_ON).text(`   ! ${item.note}`).append(ESC_BOLD_OFF).lf()
    }
  }

  doc.divider()
  doc.lf().lf().lf()
  doc.append(CUT)

  return doc.build()
}

// ─── Customer Receipt ─────────────────────────────────────────────────────────

/**
 * Builds ESC/POS bytes for a customer receipt.
 * Full receipt with store name, items, totals, payment, footer.
 */
export function buildReceiptEscPos(order: Order, settings: AppSettings): Uint8Array {
  const date    = new Date(order.paidAt ?? order.createdAt)
  const dateStr = date.toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })

  const doc = new EscPosDoc()
  doc.append(ESC_INIT).lf()

  // Store header
  doc.centerTall(settings.restaurantName)
  doc.center(`${dateStr}  ${timeStr}`)
  doc.center(`Order #${order.orderNumber}`)
  doc.center(order.type === 'dine_in' ? `Dine In - Meja ${order.tableNumber ?? ''}` : 'Take Away')
  doc.divider()

  // Items
  for (const item of order.items) {
    const nameCol = `${item.quantity}x ${item.productName}`
    doc.row(nameCol, `RM ${item.totalPrice.toFixed(2)}`)
    for (const mod of item.modifiers) {
      const modLabel = `  + ${mod.optionName}`
      const modPrice = mod.price > 0 ? `+RM ${mod.price.toFixed(2)}` : ''
      if (modPrice) doc.row(modLabel, modPrice)
      else          doc.text(modLabel).lf()
    }
    if (item.note) {
      doc.text(`  ! ${item.note}`).lf()
    }
  }

  doc.divider()

  // Totals
  doc.row('Subtotal', `RM ${order.subtotal.toFixed(2)}`)
  doc.row(`Tax (${settings.taxRate}%)`, `RM ${order.tax.toFixed(2)}`)
  if ((order.discount ?? 0) > 0) {
    doc.row('Diskaun', `-RM ${(order.discount ?? 0).toFixed(2)}`)
  }
  doc.divider()
  doc.row('JUMLAH', `RM ${order.total.toFixed(2)}`, true)
  doc.divider()

  // Payment
  if (order.paymentMethod === 'cash' && order.amountPaid != null) {
    doc.row('Tunai', `RM ${order.amountPaid.toFixed(2)}`)
    doc.row('Baki',  `RM ${(order.change ?? 0).toFixed(2)}`)
  }

  // Footer
  doc.lf()
  doc.center(settings.receiptFooter || 'Terima kasih atas kunjungan anda!')
  doc.lf().lf().lf()
  doc.append(CUT)

  return doc.build()
}
