# CrossxPOS — TypeScript Types Reference

Semua types ada dalam `src/types/index.ts`.

## Staff / Auth

```ts
type StaffRole = 'admin' | 'cashier' | 'waiter' | 'kitchen'

interface Staff {
  id: string
  name: string
  pin: string           // 4-digit
  role: StaffRole
  isActive: boolean
  createdAt: Date
}
```

## Category

```ts
interface Category {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  modifierGroupIds?: string[]  // modifier groups yang diassign ke seluruh category ini
}
```

> Produk dalam category ini akan **auto** mendapat modifier groups tersebut semasa order di CashierPage, digabung dengan `product.modifierGroupIds`.

## Modifiers

```ts
type ModifierType = 'single' | 'multiple'
// single = radio button (pilih satu)
// multiple = checkbox (boleh pilih lebih dari satu)

interface ModifierGroup {
  id: string
  name: string          // e.g. "Spice Level", "Add-ons"
  type: ModifierType
  required: boolean
  minSelect: number
  maxSelect: number
}

interface ModifierOption {
  id: string
  groupId: string
  name: string          // e.g. "Extra Spicy", "Add Egg"
  price: number         // harga tambahan
  sortOrder: number
}
```

## Product

```ts
interface Product {
  id: string
  categoryId: string
  name: string
  description?: string
  price: number         // base price
  image?: string        // base64 atau URL
  modifierGroupIds: string[]
  isActive: boolean
  sortOrder: number
}
```

## Table

```ts
type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning'

interface Table {
  id: string
  number: string        // e.g. "T1", "A2", "VIP"
  capacity: number
  status: TableStatus
  currentOrderId?: string
  section?: string      // e.g. "Indoor", "Outdoor"
}
```

## Order

```ts
type OrderType = 'dine_in' | 'takeaway'
type OrderStatus = 'open' | 'sent_to_kitchen' | 'ready' | 'paid' | 'cancelled'
type PaymentMethod = 'cash' | 'card' | 'qr'
type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served'

interface OrderItemModifier {
  modifierGroupId: string
  modifierGroupName: string
  optionId: string
  optionName: string
  price: number
}

interface OrderItem {
  id: string
  productId: string
  productName: string
  price: number         // base price pada masa order
  quantity: number
  modifiers: OrderItemModifier[]
  note?: string
  status: OrderItemStatus
  totalPrice: number    // (price + sum of modifier prices) × quantity
}

interface Order {
  id: string
  orderNumber: number   // short number untuk display (5 digit)
  type: OrderType
  tableId?: string
  tableNumber?: string
  staffId: string
  staffName: string
  items: OrderItem[]
  status: OrderStatus
  subtotal: number      // sum of item totalPrice
  tax: number           // subtotal × taxRate%
  discount: number      // flat discount amount (computed)
  discountType?: 'flat' | 'percent'
  discountValue?: number // raw input value
  total: number         // subtotal + tax - discount
  paymentMethod?: PaymentMethod
  amountPaid?: number
  change?: number
  note?: string
  shiftId?: string      // ID shift semasa order dibuat
  voidReason?: string   // sebab void (jika status === 'voided')
  createdAt: Date
  updatedAt: Date
  paidAt?: Date
}
```

## Shift

```ts
interface Shift {
  id: string
  status: 'open' | 'closed'
  openedAt: Date
  closedAt?: Date
  openedBy: string        // nama cashier yang buka shift
  openedById: string
  closedBy?: string
  closedById?: string
  cashFloat: number       // modal tunai awal (RM)
  closingCash?: number    // kiraan tunai sebenar masa tutup (dibulatkan ke 5 sen)
  notes?: string
}
```

> **Variance** = `closingCash` − `Math.round(cashFloat + cashSales)`  
> `cashSales` = jumlah order.total di mana `paymentMethod === 'cash'` dalam shift tersebut.

## Settings

```ts
interface PrinterConfig {
  ip: string
  port: number          // default 9100
  enabled: boolean
}

interface AppSettings {
  restaurantName: string
  currency: string      // e.g. "MYR"
  taxRate: number       // percentage, e.g. 6
  receiptFooter: string
  receiptPrinter: PrinterConfig
  kitchenPrinter: PrinterConfig
}
```
