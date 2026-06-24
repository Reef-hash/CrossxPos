/**
 * CrossxPOS ESC/POS Command Builder
 *
 * Pure-JS ESC/POS command builder for thermal receipt printers.
 * Generates byte arrays that can be sent via Network (TCP), Bluetooth (SPP), or USB.
 *
 * Reference: EPSON ESC/POS Application Programming Guide
 * Paper widths: 58mm = 384 dots, 80mm = 576 dots (at 203 dpi)
 */

// ─── ESC/POS Commands ─────────────────────────────────────────────────────────

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const CR = 0x0d

const CMD = {
  INIT:          [ESC, 0x40],                     // Initialize printer
  ALIGN_LEFT:    [ESC, 0x61, 0x00],
  ALIGN_CENTER:  [ESC, 0x61, 0x01],
  ALIGN_RIGHT:   [ESC, 0x61, 0x02],
  BOLD_ON:       [ESC, 0x45, 0x01],
  BOLD_OFF:      [ESC, 0x45, 0x00],
  UNDERLINE_ON:  [ESC, 0x2d, 0x01],
  UNDERLINE_OFF: [ESC, 0x2d, 0x00],
  DOUBLE_HEIGHT: [ESC, 0x21, 0x10],               // 2x height
  DOUBLE_WIDTH:  [ESC, 0x21, 0x20],               // 2x width
  NORMAL_SIZE:   [ESC, 0x21, 0x00],
  LINE_SPACING:  (n: number) => [ESC, 0x33, n],
  FEED:          (n: number) => [ESC, 0x64, n],   // Feed n lines
  CUT_PARTIAL:   [GS, 0x56, 0x41, 0x00],         // Partial cut (most common)
  CUT_FULL:      [GS, 0x56, 0x41, 0x01],         // Full cut
  DRAWER_KICK:   [ESC, 0x70, 0x00, 0x64, 0x64],  // Kick cash drawer on pin 2
  DIVIDER:       (char: string, width: number) => [char.repeat(width)],
  TABLE_SPACING: [0x09],                          // Tab (horizontal)
  // Barcode
  BARCODE_HRI_BELOW: [GS, 0x48, 0x02],           // Human-readable below
  BARCODE_WIDTH:  (n: number) => [GS, 0x77, n],
  BARCODE_HEIGHT: (n: number) => [GS, 0x68, n],
  BARCODE_PRINT:  (data: string) => [GS, 0x6b, 0x45, data.length, ...toBytes(data)],
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toBytes(str: string): number[] {
  const encoder = new TextEncoder()
  return Array.from(encoder.encode(str))
}

function repeat(byte: number, count: number): number[] {
  return new Array(count).fill(byte)
}

/**
 * Get the max character width for a given paper width in mm.
 * Uses standard 12x24 font (~12 chars per inch).
 */
export function getPaperWidth(chars: 58 | 80): number {
  return chars === 80 ? 48 : 32
}

// ─── EscPosBuilder ────────────────────────────────────────────────────────────

export class EscPosBuilder {
  private buffer: number[] = []
  private _paperWidth: number

  constructor(paperWidthMm: 58 | 80 = 58) {
    this._paperWidth = paperWidthMm
    // Initialize printer
    this.add(...CMD.INIT)
  }

  private add(...bytes: (number | number[])[]): this {
    for (const b of bytes) {
      if (Array.isArray(b)) {
        this.buffer.push(...b)
      } else {
        this.buffer.push(b)
      }
    }
    return this
  }

  // ─── Build / Output ───────────────────────────────────────────────────

  /** Returns the ESC/POS byte array */
  toBytes(): Uint8Array {
    return new Uint8Array(this.buffer)
  }

  /** Returns base64-encoded string for wire transfer */
  toBase64(): string {
    return btoa(String.fromCharCode(...this.buffer))
  }

  /** Returns a Blob for download / debug */
  toBlob(): Blob {
    return new Blob([this.toBytes()], { type: 'application/octet-stream' })
  }

  // ─── Text ─────────────────────────────────────────────────────────────

  text(str: string, wrap = true): this {
    if (wrap) {
      const width = getPaperWidth(this._paperWidth)
      const lines = this.wrapText(str, width)
      for (const line of lines) {
        this.add(...toBytes(line), LF)
      }
    } else {
      this.add(...toBytes(str))
    }
    return this
  }

  textLine(str: string): this {
    return this.text(str).add(LF)
  }

  /** Bold text line */
  boldLine(str: string): this {
    return this
      .add(...CMD.BOLD_ON)
      .text(str)
      .add(...CMD.BOLD_OFF, LF)
  }

  /** Double-height text (e.g., order type header) */
  doubleLine(str: string): this {
    return this
      .add(...CMD.DOUBLE_HEIGHT, ...CMD.BOLD_ON)
      .text(str)
      .add(...CMD.BOLD_OFF, ...CMD.NORMAL_SIZE, LF)
  }

  // ─── Alignment ────────────────────────────────────────────────────────

  left(): this {
    return this.add(...CMD.ALIGN_LEFT)
  }
  center(): this {
    return this.add(...CMD.ALIGN_CENTER)
  }
  right(): this {
    return this.add(...CMD.ALIGN_RIGHT)
  }

  /** Center-aligned text line(s) */
  centered(str: string): this {
    return this.center().text(str).left()
  }

  // ─── Formatting ───────────────────────────────────────────────────────

  bold(str: string): this {
    return this.add(...CMD.BOLD_ON).text(str, false).add(...CMD.BOLD_OFF)
  }

  underline(str: string): this {
    return this.add(...CMD.UNDERLINE_ON).text(str, false).add(...CMD.UNDERLINE_OFF)
  }

  /** Horizontal divider line */
  divider(char = '-', width?: number): this {
    const w = width ?? getPaperWidth(this._paperWidth)
    return this.text(char.repeat(w))
  }

  // ─── Spaces / Padding ─────────────────────────────────────────────────

  /** Empty line */
  blank(n = 1): this {
    for (let i = 0; i < n; i++) {
      this.add(LF)
    }
    return this
  }

  /** Two-column layout: left text | right text */
  twoColumn(left: string, right: string): this {
    const width = getPaperWidth(this._paperWidth)
    const leftWidth = width - right.length - 2
    const leftPadded = left.slice(0, leftWidth).padEnd(leftWidth, ' ')
    return this.text(`${leftPadded} ${right}`)
  }

  /** Item line: qty x name ... price */
  itemLine(qty: number, name: string, price: string): this {
    const width = getPaperWidth(this._paperWidth)
    const qtyStr = qty > 1 ? `${qty}x ` : ''
    const maxNameWidth = width - qtyStr.length - price.length - 3
    const namePadded = name.slice(0, maxNameWidth).padEnd(maxNameWidth, '.')
    return this.text(`${qtyStr}${namePadded} ${price}`)
  }

  // ─── Barcode ──────────────────────────────────────────────────────────

  barcode(data: string, width = 3, height = 162): this {
    return this
      .add(...CMD.BARCODE_HRI_BELOW)
      .add(...CMD.BARCODE_WIDTH(width))
      .add(...CMD.BARCODE_HEIGHT(height))
      .add(...CMD.BARCODE_PRINT(data))
      .add(LF)
  }

  // ─── Feed & Cut ───────────────────────────────────────────────────────

  feed(n = 1): this {
    return this.add(...CMD.FEED(n))
  }

  cut(partial = true): this {
    return this.add(...(partial ? CMD.CUT_PARTIAL : CMD.CUT_FULL))
  }

  // ─── Drawer ───────────────────────────────────────────────────────────

  kickDrawer(): this {
    return this.add(...CMD.DRAWER_KICK)
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Simple word-wrapping for monospaced thermal printers.
   * Splits on word boundaries where possible, falls back to hard break.
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = []
    const paragraphs = text.split('\n')

    for (const para of paragraphs) {
      if (para.length === 0) {
        lines.push('')
        continue
      }
      let remaining = para
      while (remaining.length > maxWidth) {
        // Try to break at last space within limit
        let breakAt = remaining.lastIndexOf(' ', maxWidth)
        if (breakAt <= 0) {
          // No space found — hard break
          breakAt = maxWidth
        }
        lines.push(remaining.slice(0, breakAt).trimEnd())
        remaining = remaining.slice(breakAt).trimStart()
      }
      if (remaining.length > 0) {
        lines.push(remaining)
      }
    }

    return lines
  }
}

// ─── Receipt Templates ────────────────────────────────────────────────────────

export interface ReceiptData {
  restaurantName: string
  orderNumber: number
  orderType: string          // 'Dine In' | 'Takeaway'
  tableNumber?: string
  staffName: string
  items: ReceiptItem[]
  subtotal: number
  tax: number
  taxRate: number
  discount: number
  total: number
  paymentMethod: string
  amountPaid: number
  change: number
  currency: string
  footer: string
  date: Date
  shiftId?: string
}

export interface ReceiptItem {
  name: string
  qty: number
  price: number
  modifiers?: string[]
  note?: string
}

/**
 * Build a customer receipt.
 */
export function buildReceipt(data: ReceiptData): EscPosBuilder {
  const p = new EscPosBuilder(58)
  const fmt = (n: number) => n.toFixed(2)
  const time = data.date.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })
  const d = data.date.toLocaleDateString('ms-MY')

  // Header
  p.center().doubleLine(data.restaurantName)
  p.centered(d)
  p.centered(time)
  p.blank()

  // Order info
  p.twoColumn(`Order #${data.orderNumber}`, data.orderType)
  if (data.tableNumber) {
    p.twoColumn('Table', data.tableNumber)
  }
  p.textLine(`Cashier: ${data.staffName}`)
  p.divider()

  // Items
  p.left()
  for (const item of data.items) {
    if (item.qty > 1) {
      p.text(`${item.qty}x `, false)
    }
    p.bold(item.name)
    p.right().text(fmt(item.price))
    p.left()

    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        p.text(`  + ${mod}`)
      }
    }
    if (item.note) {
      p.text(`  * ${item.note}`)
    }
  }

  p.divider()

  // Totals
  p.twoColumn('Subtotal', fmt(data.subtotal))
  if (data.tax > 0) {
    p.twoColumn(`Tax (${data.taxRate}%)`, fmt(data.tax))
  }
  if (data.discount > 0) {
    p.twoColumn('Discount', `-${fmt(data.discount)}`)
  }
  p.divider('-')
  p.boldLine(`TOTAL  ${fmt(data.total)}`)

  // Payment
  p.twoColumn(data.paymentMethod, fmt(data.amountPaid))
  if (data.change > 0) {
    p.twoColumn('Change', fmt(data.change))
  }

  // Footer
  p.blank()
  p.centered(data.footer)
  p.centered('Thank You!')

  // Shift ID for tracking
  if (data.shiftId) {
    p.blank()
    p.centered(`Shift: ${data.shiftId.slice(0, 8)}`)
  }

  // Cut
  p.feed(3)
  p.cut()

  return p
}

// ─── Kitchen Ticket Templates (KOT) ───────────────────────────────────────────

export interface KOTData {
  restaurantName: string
  orderNumber: number
  orderType: string
  tableNumber?: string
  staffName: string
  station: string          // e.g. 'Kitchen', 'Bar'
  items: KOTItem[]
  note?: string
  date: Date
}

export interface KOTItem {
  name: string
  qty: number
  modifiers?: string[]
  note?: string
}

/**
 * Build a Kitchen Order Ticket for one station.
 * KOTs are double-height + bold for visibility in kitchen.
 */
export function buildKOT(data: KOTData): EscPosBuilder {
  const p = new EscPosBuilder(80) // Kitchen printers usually 80mm
  const time = data.date.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })

  // Double-strike header — very visible
  p.center()
  p.add(...CMD.DOUBLE_HEIGHT, ...CMD.DOUBLE_WIDTH, ...CMD.BOLD_ON)
  p.textLine(data.station.toUpperCase())
  p.add(...CMD.NORMAL_SIZE, ...CMD.BOLD_OFF)

  // Order info
  p.left()
  p.boldLine(`Order #${data.orderNumber}  [${data.orderType}]`)
  if (data.tableNumber) {
    p.boldLine(`Table: ${data.tableNumber}`)
  }
  p.textLine(`By: ${data.staffName}  ${time}`)
  p.divider('=')

  // Items — large and bold
  p.add(...CMD.BOLD_ON)
  for (const item of data.items) {
    const qtyLabel = item.qty > 1 ? `[${item.qty}x] ` : ''
    p.textLine(`${qtyLabel}${item.name}`)

    if (item.modifiers?.length) {
      p.add(...CMD.BOLD_OFF)
      for (const mod of item.modifiers) {
        p.textLine(`   └ ${mod}`)
      }
      p.add(...CMD.BOLD_ON)
    }
    if (item.note) {
      p.add(...CMD.BOLD_OFF)
      p.textLine(`   * ${item.note}`)
      p.add(...CMD.BOLD_ON)
    }
  }
  p.add(...CMD.BOLD_OFF)
  p.divider('=')

  if (data.note) {
    p.textLine(`Note: ${data.note}`)
    p.divider('=')
  }

  // Footer timestamp
  p.blank()
  p.centered(`Printed: ${time}`)
  p.feed(2)
  p.cut()

  return p
}

// ─── Cash Drawer Open ─────────────────────────────────────────────────────────

/** Build a minimal command to open the cash drawer. */
export function buildDrawerKick(): EscPosBuilder {
  return new EscPosBuilder(58).kickDrawer()
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Convert any EscPosBuilder to base64 for the print-bridge HTTP API.
 */
export function builderToBase64(builder: EscPosBuilder): string {
  return builder.toBase64()
}
