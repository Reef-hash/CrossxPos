import Dexie, { type EntityTable } from 'dexie'
import type {
  Staff,
  Category,
  ModifierGroup,
  ModifierOption,
  Product,
  Table,
  Order,
  AppSettings,
} from '@/types'

class PosDatabase extends Dexie {
  staff!: EntityTable<Staff, 'id'>
  categories!: EntityTable<Category, 'id'>
  modifierGroups!: EntityTable<ModifierGroup, 'id'>
  modifierOptions!: EntityTable<ModifierOption, 'id'>
  products!: EntityTable<Product, 'id'>
  dineTables!: EntityTable<Table, 'id'>
  orders!: EntityTable<Order, 'id'>
  settings!: EntityTable<AppSettings & { id: string }, 'id'>

  constructor() {
    super('CrossxPosDB')

    this.version(1).stores({
      staff: 'id, role, isActive',
      categories: 'id, sortOrder, isActive',
      modifierGroups: 'id',
      modifierOptions: 'id, groupId',
      products: 'id, categoryId, isActive, sortOrder',
      tables: 'id, status, section',
      orders: 'id, orderNumber, status, type, tableId, staffId, createdAt',
      settings: 'id',
    })

    this.version(2).stores({
      staff: 'id, pin, role, isActive',
      categories: 'id, sortOrder, isActive',
      modifierGroups: 'id',
      modifierOptions: 'id, groupId',
      products: 'id, categoryId, isActive, sortOrder',
      tables: 'id, status, section',
      orders: 'id, orderNumber, status, type, tableId, staffId, createdAt',
      settings: 'id',
    })

    this.version(3).stores({
      staff: 'id, pin, name, role, isActive',
      categories: 'id, sortOrder, isActive',
      modifierGroups: 'id',
      modifierOptions: 'id, groupId',
      products: 'id, categoryId, isActive, sortOrder',
      tables: 'id, number, status, section',
      orders: 'id, orderNumber, status, type, tableId, staffId, createdAt',
      settings: 'id',
    })

    this.version(4).stores({
      staff: 'id, pin, name, role, isActive',
      categories: 'id, sortOrder, isActive',
      modifierGroups: 'id',
      modifierOptions: 'id, groupId',
      products: 'id, categoryId, isActive, sortOrder',
      tables: null,
      dineTables: 'id, number, status, section',
      orders: 'id, orderNumber, status, type, tableId, staffId, createdAt',
      settings: 'id',
    }).upgrade(async (tx) => {
      const oldTables = await tx.table('tables').toArray()
      if (oldTables.length > 0) {
        await tx.table('dineTables').bulkAdd(oldTables)
      }
    })
  }
}

export const db = new PosDatabase()

// ─── Seed default settings on first run ───────────────────────────────────────

export async function initializeDatabase() {
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) {
    await db.settings.add({
      id: 'app',
      restaurantName: 'My Restaurant',
      currency: 'MYR',
      taxRate: 6,
      receiptFooter: 'Thank you for dining with us!',
      receiptPrinter: { ip: '192.168.1.100', port: 9100, enabled: false },
      kitchenPrinter: { ip: '192.168.1.101', port: 9100, enabled: false },
    })
  }

  // Seed a default admin if no staff exists
  const staffCount = await db.staff.count()
  if (staffCount === 0) {
    await db.staff.add({
      id: crypto.randomUUID(),
      name: 'Admin',
      pin: '1234',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
    })
  }
}
