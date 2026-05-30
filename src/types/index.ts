// ─── Staff / Auth ─────────────────────────────────────────────────────────────

export type StaffRole = 'admin' | 'cashier' | 'waiter' | 'kitchen'

export interface Staff {
  id: string
  name: string
  pin: string // 4-digit PIN
  role: StaffRole
  isActive: boolean
  createdAt: Date
}

// ─── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  modifierGroupIds?: string[]
  kitchenStation?: string   // e.g. 'Kitchen' | 'Bar' | 'Western'
}

// ─── Modifiers ────────────────────────────────────────────────────────────────

export type ModifierType = 'single' | 'multiple'

export interface ModifierGroup {
  id: string
  name: string
  type: ModifierType
  required: boolean
  minSelect: number
  maxSelect: number
}

export interface ModifierOption {
  id: string
  groupId: string
  name: string
  price: number
  sortOrder: number
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface Product {
  id: string
  categoryId: string
  name: string
  description?: string
  price: number
  image?: string
  modifierGroupIds: string[]
  isActive: boolean
  sortOrder: number
}

// ─── Table ────────────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'occupied' | 'reserved'

export interface Table {
  id: string
  number: string
  capacity: number
  status: TableStatus
  currentOrderId?: string
  section?: string
}

// ─── Reservation ──────────────────────────────────────────────────────────────

export type ReservationStatus = 'pending' | 'seated' | 'cancelled'

export interface Reservation {
  id: string
  tableId: string
  tableNumber: string
  customerName: string
  phone?: string
  datetime: string        // ISO string
  pax: number
  notes?: string
  status: ReservationStatus
  createdAt: Date
}

// ─── Order ────────────────────────────────────────────────────────────────────

export type OrderType = 'dine_in' | 'takeaway'
export type OrderStatus = 'open' | 'sent_to_kitchen' | 'ready' | 'paid' | 'cancelled' | 'voided'
export type PaymentMethod = 'cash' | 'card' | 'qr'
export type OrderItemStatus = 'pending' | 'sent' | 'ready' | 'served'

export interface OrderItemModifier {
  modifierGroupId: string
  modifierGroupName: string
  optionId: string
  optionName: string
  price: number
}

export interface OrderItem {
  id: string
  productId: string
  productName: string
  productImage?: string
  price: number
  quantity: number
  modifiers: OrderItemModifier[]
  note?: string
  status: OrderItemStatus
  totalPrice: number
  kitchenStation?: string   // denormalized from category
}

export interface Order {
  id: string
  orderNumber: number
  type: OrderType
  tableId?: string
  tableNumber?: string
  staffId: string
  staffName: string
  items: OrderItem[]
  status: OrderStatus
  subtotal: number
  tax: number
  discount: number          // computed flat RM amount (used in all calcs)
  discountType?: 'flat' | 'percent'
  discountValue?: number    // raw input (RM amount OR % value)
  total: number
  paymentMethod?: PaymentMethod
  amountPaid?: number
  change?: number
  note?: string
  shiftId?: string
  voidReason?: string
  createdAt: Date
  updatedAt: Date
  paidAt?: Date
}

// ─── Shift ───────────────────────────────────────────────────────────────────

export interface Shift {
  id: string
  status: 'open' | 'closed'
  openedAt: Date
  closedAt?: Date
  openedBy: string
  openedById: string
  closedBy?: string
  closedById?: string
  cashFloat: number
  closingCash?: number
  notes?: string
}

// ─── License ──────────────────────────────────────────────────────────────────

export type LicensePlan = 'basic' | 'pro'
export type LicenseStatus = 'active' | 'expired' | 'invalid' | 'not_activated'

/**
 * Hadkan sumber berdasarkan plan.
 * Nilai -1 bermaksud tiada had (unlimited).
 */
export interface LicenseLimits {
  maxStaff: number    // Basic: 3  | Pro: 15  | -1 = unlimited
  maxTables: number   // Basic: 10 | Pro: -1
  maxProducts: number // Basic: 50 | Pro: -1
}

/**
 * Feature flags yang dibenarkan mengikut plan.
 * Basic dan Pro sama-sama dapat voidOrder.
 */
export interface LicenseFeatures {
  voidOrder: boolean          // Semua plan
  exportReports: boolean      // Pro sahaja
  dateRangeReports: boolean   // Pro sahaja
  splitBill: boolean          // Pro sahaja
  discount: boolean           // Pro sahaja
  multiSection: boolean       // Pro sahaja
}

/**
 * Data lesen yang dikodkan di dalam license key.
 * Di-decode semasa verifikasi dan disimpan dalam licenseStore.
 */
export interface LicenseData {
  licenseId: string
  plan: LicensePlan
  restaurantName: string
  limits: LicenseLimits
  features: LicenseFeatures
  issuedAt: string   // "YYYY-MM-DD"
  expiresAt: string  // "YYYY-MM-DD"
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PrinterConfig {
  ip: string
  port: number
  enabled: boolean
}

export interface PrinterProfile {
  id: string
  name: string
  role: 'cashier' | 'kitchen'
  ip: string
  port: number
  enabled: boolean
}

export interface AppSettings {
  restaurantName: string
  currency: string
  taxRate: number
  receiptFooter: string
  receiptPrinter: PrinterConfig
  kitchenPrinter: PrinterConfig
  kitchenStations: string[]   // e.g. ['Kitchen', 'Bar']
  printerProfiles: PrinterProfile[]
  stationPrinterMap: Record<string, string>
}
