import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '@/db'
import type { Category, Product, ModifierGroup, ModifierOption } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, generateId } from '@/lib/utils'
import { useLicenseStore } from '@/store/licenseStore'
import { formatLimit } from '@/lib/license'
import { Plus, Pencil, Trash2, UtensilsCrossed, Settings2, Tag } from 'lucide-react'

type View = 'products' | 'modifiers'

export function MenuPage() {
  const [view, setView] = useState<View>('products')

  // --- Products state ---
  const [activeCatId, setActiveCatId] = useState<string | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryId: '', modifierGroupIds: [] as string[] })
  const [showAddCat, setShowAddCat] = useState(false)
  const [catName, setCatName] = useState('')

  // --- Modifiers state ---
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null)
  const [groupForm, setGroupForm] = useState({ name: '', type: 'single' as 'single' | 'multiple', required: false })
  const [showOptionModal, setShowOptionModal] = useState(false)
  const [editingOption, setEditingOption] = useState<ModifierOption | null>(null)
  const [optionForm, setOptionForm] = useState({ name: '', price: '' })

  // --- Queries ---
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray())
  const products = useLiveQuery(
    () =>
      activeCatId
        ? db.products.where('categoryId').equals(activeCatId).sortBy('sortOrder')
        : db.products.orderBy('sortOrder').toArray(),
    [activeCatId]
  )
  const modifierGroups = useLiveQuery(() => db.modifierGroups.toArray())
  const activeGroupOptions = useLiveQuery(
    () =>
      activeGroupId
        ? db.modifierOptions.where('groupId').equals(activeGroupId).sortBy('sortOrder')
        : Promise.resolve([]),
    [activeGroupId]
  )

  // --- Product handlers ---
  const resetProductForm = () => {
    setForm({ name: '', description: '', price: '', categoryId: '', modifierGroupIds: [] })
    setEditingProduct(null)
    setShowAddProduct(false)
  }

  const canAdd = useLicenseStore((s) => s.canAdd)
  const limits = useLicenseStore((s) => s.getLimits)()

  const handleSaveProduct = async () => {
    if (!form.name.trim() || !form.price) return
    // Semak had produk plan sebelum tambah rekod baru
    if (!editingProduct) {
      const total = await db.products.count()
      if (!canAdd('products', total)) {
        alert(`Had plan anda: ${formatLimit(limits.maxProducts)} produk. Naik taraf ke Pro untuk produk tanpa had.`)
        return
      }
    }
    const data: Product = {
      id: editingProduct?.id ?? generateId(),
      categoryId: form.categoryId || activeCatId || '',
      name: form.name.trim(),
      description: form.description || undefined,
      price: parseFloat(form.price),
      modifierGroupIds: form.modifierGroupIds,
      isActive: true,
      sortOrder: editingProduct?.sortOrder ?? (products?.length ?? 0),
    }
    if (editingProduct) await db.products.put(data)
    else await db.products.add(data)
    resetProductForm()
  }

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Delete this product?')) await db.products.delete(id)
  }

  const openEditProduct = (product: Product) => {
    setEditingProduct(product)
    setForm({
      name: product.name,
      description: product.description ?? '',
      price: product.price.toString(),
      categoryId: product.categoryId,
      modifierGroupIds: product.modifierGroupIds ?? [],
    })
    setShowAddProduct(true)
  }

  const handleAddCategory = async () => {
    if (!catName.trim()) return
    await db.categories.add({ id: generateId(), name: catName.trim(), sortOrder: categories?.length ?? 0, isActive: true })
    setCatName('')
    setShowAddCat(false)
  }

  const toggleModifierGroup = (groupId: string) => {
    const cur = form.modifierGroupIds
    setForm({ ...form, modifierGroupIds: cur.includes(groupId) ? cur.filter((id) => id !== groupId) : [...cur, groupId] })
  }

  // --- Modifier Group handlers ---
  const openAddGroup = () => {
    setEditingGroup(null)
    setGroupForm({ name: '', type: 'single', required: false })
    setShowGroupModal(true)
  }

  const openEditGroup = (group: ModifierGroup) => {
    setEditingGroup(group)
    setGroupForm({ name: group.name, type: group.type, required: group.required })
    setShowGroupModal(true)
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) return
    const data: ModifierGroup = {
      id: editingGroup?.id ?? generateId(),
      name: groupForm.name.trim(),
      type: groupForm.type,
      required: groupForm.required,
      minSelect: groupForm.type === 'single' ? 1 : 0,
      maxSelect: groupForm.type === 'single' ? 1 : 10,
    }
    if (editingGroup) {
      await db.modifierGroups.put(data)
    } else {
      await db.modifierGroups.add(data)
      setActiveGroupId(data.id)
    }
    setShowGroupModal(false)
  }

  const handleDeleteGroup = async (id: string) => {
    if (confirm('Delete this modifier group and all its options?')) {
      await db.modifierGroups.delete(id)
      await db.modifierOptions.where('groupId').equals(id).delete()
      if (activeGroupId === id) setActiveGroupId(null)
    }
  }

  // --- Modifier Option handlers ---
  const openAddOption = () => {
    setEditingOption(null)
    setOptionForm({ name: '', price: '' })
    setShowOptionModal(true)
  }

  const openEditOption = (option: ModifierOption) => {
    setEditingOption(option)
    setOptionForm({ name: option.name, price: option.price > 0 ? option.price.toString() : '' })
    setShowOptionModal(true)
  }

  const handleSaveOption = async () => {
    if (!optionForm.name.trim() || !activeGroupId) return
    const data: ModifierOption = {
      id: editingOption?.id ?? generateId(),
      groupId: activeGroupId,
      name: optionForm.name.trim(),
      price: parseFloat(optionForm.price) || 0,
      sortOrder: editingOption?.sortOrder ?? (activeGroupOptions?.length ?? 0),
    }
    if (editingOption) await db.modifierOptions.put(data)
    else await db.modifierOptions.add(data)
    setShowOptionModal(false)
  }

  const handleDeleteOption = async (id: string) => {
    await db.modifierOptions.delete(id)
  }

  const activeGroup = modifierGroups?.find((g) => g.id === activeGroupId)

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="flex w-44 shrink-0 flex-col border-r border-zinc-200/80 bg-white">
        <div className="flex gap-1 border-b border-zinc-200/80 p-2">
          <button
            onClick={() => setView('products')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${view === 'products' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            Products
          </button>
          <button
            onClick={() => setView('modifiers')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${view === 'modifiers' ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
          >
            Modifiers
          </button>
        </div>

        {view === 'products' && (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Categories</span>
              <button onClick={() => setShowAddCat(true)} className="text-blue-600 hover:text-blue-700">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => setActiveCatId(null)}
              className={`mb-0.5 w-full rounded-md px-2.5 py-1.5 text-left text-xs transition ${activeCatId === null ? 'bg-blue-50 font-medium text-blue-600' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              All
            </button>
            {categories?.map((cat: Category) => (
              <button
                key={cat.id}
                onClick={() => setActiveCatId(cat.id)}
                className={`w-full rounded-md px-2.5 py-1.5 text-left text-xs transition ${activeCatId === cat.id ? 'bg-blue-50 font-medium text-blue-600' : 'text-zinc-600 hover:bg-zinc-100'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {view === 'modifiers' && (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Groups</span>
              <button onClick={openAddGroup} className="text-blue-600 hover:text-blue-700">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {modifierGroups?.length === 0 && <p className="px-1 text-xs text-zinc-400">No groups yet</p>}
            {modifierGroups?.map((group: ModifierGroup) => (
              <button
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                className={`mb-0.5 w-full rounded-md px-2.5 py-1.5 text-left text-xs transition ${activeGroupId === group.id ? 'bg-blue-50 font-medium text-blue-600' : 'text-zinc-600 hover:bg-zinc-100'}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{group.name}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${group.type === 'single' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                    {group.type}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-auto p-5">
        {view === 'products' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-base font-bold text-zinc-900">Menu Items</h1>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null)
                  setForm({ name: '', description: '', price: '', categoryId: activeCatId ?? '', modifierGroupIds: [] })
                  setShowAddProduct(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            {products && products.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product: Product) => (
                  <div key={product.id} className="rounded-xl border border-zinc-200/80 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-900">{product.name}</p>
                        {product.description && <p className="mt-0.5 text-xs text-zinc-500">{product.description}</p>}
                        <p className="mt-1 text-sm font-semibold text-blue-600">{formatCurrency(product.price)}</p>
                        {(product.modifierGroupIds?.length ?? 0) > 0 && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                            <Settings2 className="h-3 w-3" />
                            {product.modifierGroupIds.length} modifier group{product.modifierGroupIds.length > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-0.5">
                        <button onClick={() => openEditProduct(product)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteProduct(product.id)} className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <UtensilsCrossed className="mb-2 h-12 w-12" />
                <p className="text-sm font-medium">No menu items</p>
              </div>
            )}
          </>
        )}

        {view === 'modifiers' && (
          <>
            {activeGroup ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-zinc-900">{activeGroup.name}</h2>
                    <p className="text-xs text-zinc-500">
                      {activeGroup.type === 'single' ? 'Single choice' : 'Multiple choice'}
                      {activeGroup.required ? ' · Required' : ' · Optional'}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openEditGroup(activeGroup)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteGroup(activeGroup.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={openAddOption}>
                      <Plus className="h-3.5 w-3.5" /> Add Option
                    </Button>
                  </div>
                </div>

                {activeGroupOptions && activeGroupOptions.length > 0 ? (
                  <div className="space-y-1.5">
                    {activeGroupOptions.map((opt: ModifierOption) => (
                      <div key={opt.id} className="flex items-center justify-between rounded-lg border border-zinc-200/80 bg-white p-2.5">
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{opt.name}</p>
                          {opt.price > 0 ? (
                            <p className="text-xs font-semibold text-blue-600">+{formatCurrency(opt.price)}</p>
                          ) : (
                            <p className="text-xs text-zinc-400">No extra charge</p>
                          )}
                        </div>
                        <div className="flex gap-0.5">
                          <button onClick={() => openEditOption(opt)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeleteOption(opt.id)} className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                    <Tag className="mb-2 h-10 w-10" />
                    <p className="text-sm font-medium">No options yet</p>
                    <Button size="sm" className="mt-2.5" onClick={openAddOption}>
                      <Plus className="h-3.5 w-3.5" /> Add First Option
                    </Button>
                  </div>
                )}

                {/* Assign to Categories */}
                {categories && categories.length > 0 && (
                  <div className="mt-5 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5">
                    <p className="mb-0.5 text-xs font-semibold text-zinc-700">Apply to Categories</p>
                    <p className="mb-3 text-[11px] text-zinc-400">
                      Products in selected categories will automatically have this modifier group.
                    </p>
                    <div className="space-y-1.5">
                      {categories.map((cat: Category) => {
                        const assigned = cat.modifierGroupIds?.includes(activeGroup.id) ?? false
                        return (
                          <label key={cat.id} className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={async () => {
                                const current = cat.modifierGroupIds ?? []
                                const updated = assigned
                                  ? current.filter((id) => id !== activeGroup.id)
                                  : [...current, activeGroup.id]
                                await db.categories.update(cat.id, { modifierGroupIds: updated })
                              }}
                              className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600"
                            />
                            <span className="text-xs text-zinc-700">{cat.name}</span>
                            {assigned && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">assigned</span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Settings2 className="mb-2 h-12 w-12" />
                <p className="text-sm font-medium">Select a modifier group</p>
                <p className="text-xs">or create a new one from the sidebar</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3.5 text-sm font-semibold text-zinc-900">{editingProduct ? 'Edit Item' : 'Add Menu Item'}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Description</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Price (MYR) *</label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Category</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">No category</option>
                  {categories?.map((cat: Category) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {modifierGroups && modifierGroups.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Modifier Groups</label>
                    <div className="space-y-1 rounded-lg border border-zinc-200 p-2.5">
                      {modifierGroups.map((group: ModifierGroup) => (
                        <label key={group.id} className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.modifierGroupIds.includes(group.id)}
                            onChange={() => toggleModifierGroup(group.id)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600"
                          />
                          <span className="flex-1 text-xs text-zinc-700">{group.name}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${group.type === 'single' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                            {group.type}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
              )}
            </div>
            <div className="mt-3.5 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={resetProductForm}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSaveProduct}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900">Add Category</h3>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category name" onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddCat(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleAddCategory}>Add</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3.5 text-sm font-semibold text-zinc-900">{editingGroup ? 'Edit Group' : 'Add Modifier Group'}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Group Name *</label>
                <Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="e.g. Spice Level, Add-ons" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-700">Selection Type</label>
                <div className="flex gap-1.5">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 p-2.5 transition hover:border-blue-300">
                    <input type="radio" checked={groupForm.type === 'single'} onChange={() => setGroupForm({ ...groupForm, type: 'single' })} className="text-blue-600" />
                    <div>
                      <p className="text-xs font-medium">Single</p>
                      <p className="text-[11px] text-zinc-500">Choose one</p>
                    </div>
                  </label>
                  <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 p-2.5 transition hover:border-blue-300">
                    <input type="radio" checked={groupForm.type === 'multiple'} onChange={() => setGroupForm({ ...groupForm, type: 'multiple' })} className="text-blue-600" />
                    <div>
                      <p className="text-xs font-medium">Multiple</p>
                      <p className="text-[11px] text-zinc-500">Choose many</p>
                    </div>
                  </label>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm({ ...groupForm, required: e.target.checked })} className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                <span className="text-xs font-medium text-zinc-800">Required (customer must select)</span>
              </label>
            </div>
            <div className="mt-3.5 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowGroupModal(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSaveGroup}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Option Modal */}
      {showOptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
            <h3 className="mb-3.5 text-sm font-semibold text-zinc-900">{editingOption ? 'Edit Option' : 'Add Option'}</h3>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Option Name *</label>
                <Input value={optionForm.name} onChange={(e) => setOptionForm({ ...optionForm, name: e.target.value })} placeholder="e.g. Extra Spicy, Add Egg" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Extra Price (MYR)</label>
                <Input type="number" step="0.50" value={optionForm.price} onChange={(e) => setOptionForm({ ...optionForm, price: e.target.value })} placeholder="0.00 (free)" />
              </div>
            </div>
            <div className="mt-3.5 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowOptionModal(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSaveOption}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
