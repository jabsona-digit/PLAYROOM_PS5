'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit2, Archive, ListTree, PackageSearch, AlertTriangle, Save, Trash2, Check, X, ScanLine, FileUp, FileDown, ImagePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { downloadTemplate, readExcel } from '@/lib/excel'
import { gel } from '@/lib/ui'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'
import dynamic from 'next/dynamic'

const BarcodeScanner = dynamic(() => import('./barcode-scanner'), { ssr: false })

// Temporary generic API calls since backend is pending schema expansion
interface BarCategory {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  parent_id?: number | null
}

interface BarProduct {
  id: number
  category_id: number | null
  name: string
  price: number
  is_active: boolean
  stock_quantity?: number
  low_stock_threshold?: number
  cost_price?: number
  barcode?: string
  image_url?: string
}

export function Inventory() {
  const { currentOrgId } = useOrg()
  const { pushToast } = usePlayroom()

  const [categories, setCategories] = useState<BarCategory[]>([])
  const [products, setProducts] = useState<BarProduct[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number | 'all'>('all')

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [prodModalOpen, setProdModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BarProduct | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [delCatId, setDelCatId] = useState<number | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

  const handleScan = (code: string) => {
    const match = products.find(x => x.barcode === code)
    if (match) {
      setEditingProduct(match)
      pushToast('info', 'პროდუქტი ნაპოვნია, ჩაირთო რედაქტირების რეჟიმი')
    } else {
      setScannedBarcode(code)
      setProdModalOpen(true)
      pushToast('info', 'ახალი ბარკოდი დაფიქსირდა, დაამატეთ პროდუქტი')
    }
  }

  // Hard-delete a product; if it's referenced by past sales the FK blocks it,
  // so fall back to deactivating (hides it from POS, keeps history intact).
  const handleDeleteProduct = async (id: number) => {
    const { error } = await supabase.from('bar_products').delete().eq('id', id)
    if (error) {
      const { error: e2 } = await supabase.from('bar_products').update({ is_active: false }).eq('id', id)
      if (e2) return pushToast('danger', e2.message)
      pushToast('info', 'პროდუქტი გაყიდვებშია გამოყენებული — დაიმალა (გათიშულია)')
    } else {
      pushToast('success', 'პროდუქტი წაიშალა')
    }
    setDeletingId(null)
    fetchAll()
  }

  // Delete a category; detach its products first so they aren't lost (become uncategorized).
  const handleDeleteCategory = async (id: number) => {
    if (!currentOrgId) return
    await supabase.from('bar_products').update({ category_id: null }).eq('category_id', id).eq('org_id', currentOrgId)
    const { error } = await supabase.from('bar_categories').delete().eq('id', id)
    if (error) return pushToast('danger', error.message)
    pushToast('success', 'კატეგორია წაიშალა')
    if (activeCategoryId === id) setActiveCategoryId('all')
    setDelCatId(null)
    fetchAll()
  }

  const fetchAll = async () => {
    if (!currentOrgId) return
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('bar_categories').select('*').eq('org_id', currentOrgId).order('sort_order'),
      supabase.from('bar_products').select('*').eq('org_id', currentOrgId).order('name')
    ])
    if (cats) setCategories(cats as any)
    if (prods) setProducts(prods as any)
  }

  useEffect(() => {
    fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId])

  const displayedProducts = products
    .filter(p => activeCategoryId === 'all' || p.category_id === activeCategoryId)
    .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode === searchQuery)

  useEffect(() => {
    let buffer = ''
    let lastTime = 0
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const time = Date.now()
      if (time - lastTime > 100) buffer = ''
      lastTime = time

      if (e.key === 'Enter') {
        if (buffer.length > 2) {
          const match = products.find(x => x.barcode === buffer)
          if (match) {
            setEditingProduct(match)
            pushToast('info', 'პროდუქტი ნაპოვნია, ჩაირთო რედაქტირების რეჟიმი')
          } else {
            setScannedBarcode(buffer)
            setProdModalOpen(true)
            pushToast('info', 'ახალი ბარკოდი დაფიქსირდა, დაამატეთ პროდუქტი')
          }
        }
        buffer = ''
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [products, pushToast])

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentOrgId) return

    try {
      const data = await readExcel(file)
      if (!data.length) return pushToast('warning', 'ფაილი ცარიელია')

      // 1. Collect and create missing categories
      const uniqueCats = Array.from(new Set(data.map((item: any) => String(item['კატეგორია'] || '').trim()).filter(Boolean)))
      const missingCats = uniqueCats.filter(name => !categories.find(c => c.name.toLowerCase() === name.toLowerCase()))

      const createdCats: Record<string, number> = {}
      
      if (missingCats.length > 0) {
        const { data: newCats, error: catError } = await supabase
          .from('bar_categories')
          .insert(missingCats.map(name => ({ name, org_id: currentOrgId })))
          .select()
        
        if (catError) throw catError
        if (newCats) {
          newCats.forEach(c => { createdCats[c.name.toLowerCase()] = c.id })
        }
      }

      // 2. Map products with correct category IDs
      const toInsert = data.map((item: any) => {
        const catName = String(item['კატეგორია'] || '').trim().toLowerCase()
        const existingCat = categories.find(c => c.name.toLowerCase() === catName)
        const catId = existingCat ? existingCat.id : (createdCats[catName] || null)
        
        return {
          org_id: currentOrgId,
          name: String(item['დასახელება'] || 'უსახელო'),
          barcode: String(item['ბარკოდი'] || ''),
          cost_price: Number(item['შესყიდვის ფასი']) || 0,
          price: Number(item['გასაყიდი ფასი']) || 0,
          stock_quantity: Number(item['მარაგი']) || 0,
          category_id: catId,
          image_url: item['სურათის URL'] || null,
          is_active: true
        }
      })

      const { error } = await supabase.from('bar_products').insert(toInsert)
      if (error) throw error

      pushToast('success', `${toInsert.length} პროდუქტი წარმატებით დაემატა`)
      fetchAll()
    } catch (err: any) {
      pushToast('danger', 'იმპორტისას მოხდა შეცდომა: ' + err.message)
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row">
      
      {/* Sidebar: Categories */}
      <div className="nm-raised flex h-fit w-full flex-col rounded-[2rem] p-5 lg:w-[320px] shrink-0">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <ListTree className="size-5 text-primary" />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">კატეგორიები</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={cn(
              "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-bold transition-all",
              activeCategoryId === 'all' ? "nm-daylight text-primary" : "nm-btn text-muted-foreground"
            )}
          >
            <span>ყველა პროდუქტი</span>
            <span className="nm-inset flex size-6 items-center justify-center rounded-full text-xs">
              {products.length}
            </span>
          </button>
          
          {categories.map(c => {
            const count = products.filter(p => p.category_id === c.id).length
            return (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-1 rounded-xl pr-1.5 transition-all",
                  activeCategoryId === c.id ? "nm-daylight" : "nm-btn"
                )}
              >
                <button
                  onClick={() => setActiveCategoryId(c.id)}
                  className={cn(
                    "flex flex-1 items-center justify-between px-4 py-3 text-sm font-bold",
                    activeCategoryId === c.id ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span>{c.name}</span>
                  <span className="nm-inset flex size-6 items-center justify-center rounded-full text-xs">
                    {count}
                  </span>
                </button>
                {delCatId === c.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDeleteCategory(c.id)} title="დადასტურება" className="rounded-lg p-1.5 text-[var(--status-expired)]">
                      <Check className="size-4" />
                    </button>
                    <button onClick={() => setDelCatId(null)} title="გაუქმება" className="rounded-lg p-1.5 text-muted-foreground">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDelCatId(c.id)} title="წაშლა" className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 hover:text-[var(--status-expired)]">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={() => setCatModalOpen(true)}
          className="nm-btn mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-primary"
        >
          <Plus className="size-4" />
          კატეგორიის დამატება
        </button>
      </div>

      {/* Main Grid: Products */}
      <div className="flex flex-1 flex-col gap-6 min-w-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <PackageSearch className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">მარაგი</h2>
              <p className="text-xs text-muted-foreground">მართეთ ფასები და ნაშთები</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 sm:max-w-xl">
            <input
              type="search"
              placeholder="🔍 ძებნა..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="nm-inset flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground min-w-0"
            />
            
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => downloadTemplate('products', categories.map(c => c.name))}
                className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary/70 hover:text-primary transition-colors"
                title="შაბლონის ჩამოტვირთვა"
              >
                <FileDown className="size-4" />
              </button>
              
              <label className="nm-btn flex size-10 cursor-pointer items-center justify-center rounded-xl text-primary/70 hover:text-primary transition-colors">
                <FileUp className="size-4" />
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
              </label>

              <button
                onClick={() => setScannerOpen(true)}
                className="nm-btn flex size-10 items-center justify-center rounded-xl text-primary/70 hover:text-primary transition-colors"
                title="კამერით სკანირება"
              >
                <ScanLine className="size-4" />
              </button>

              <button
                onClick={() => { setScannedBarcode(''); setProdModalOpen(true); }}
                className="nm-btn flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-primary"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">დამატება</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayedProducts.map(p => {
            const stock = p.stock_quantity ?? 0
            const threshold = p.low_stock_threshold ?? 5
            const cost = p.cost_price ?? 0
            const profit = p.price - cost
            const lowStock = stock <= threshold && p.is_active

            return (
              <div
                key={p.id}
                className={cn(
                  "nm-raised relative flex flex-col gap-3 rounded-[2rem] p-5",
                  !p.is_active && "opacity-60 grayscale"
                )}
              >
                <div className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl nm-inset p-4 flex items-center justify-center mb-3">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="h-full w-full object-contain drop-shadow-md transition-transform duration-300 hover:scale-105" />
                  ) : (
                    <PackageSearch className="size-12 text-muted-foreground/30" />
                  )}
                  
                  <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                    {deletingId === p.id ? (
                      <>
                        <button onClick={() => handleDeleteProduct(p.id)} title="დადასტურება" className="nm-btn rounded-xl p-2 text-[var(--status-expired)] bg-background/50 backdrop-blur-md">
                          <Check className="size-4" />
                        </button>
                        <button onClick={() => setDeletingId(null)} title="გაუქმება" className="nm-btn rounded-xl p-2 text-muted-foreground bg-background/50 backdrop-blur-md">
                          <X className="size-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditingProduct(p)} title="რედაქტირება" className="nm-btn rounded-xl p-2 text-muted-foreground bg-background/50 backdrop-blur-md">
                          <Edit2 className="size-4" />
                        </button>
                        <button onClick={() => setDeletingId(p.id)} title="წაშლა" className="nm-btn rounded-xl p-2 text-muted-foreground hover:text-[var(--status-expired)] bg-background/50 backdrop-blur-md">
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="px-1 flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-3">
                    <p className="font-extrabold leading-tight text-foreground/90 line-clamp-2">{p.name}</p>
                    <div className="nm-inset px-2.5 py-1 rounded-lg text-sm font-black text-primary whitespace-nowrap">
                      {gel(p.price)}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {p.barcode ? `ბარკოდი: ${p.barcode}` : `ID: ${p.id}`}
                  </p>

                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div className="nm-inset rounded-xl p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">შესყიდვა</p>
                      <p className="font-mono font-bold">{gel(cost)}</p>
                    </div>
                    <div className="nm-inset rounded-xl p-3">
                      <p className="text-[10px] text-muted-foreground uppercase">მოგება</p>
                      <p className="font-mono font-bold text-primary">{gel(profit)}</p>
                    </div>
                  </div>

                  <div className="mt-1 flex items-center justify-between nm-inset rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Archive className="size-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">ნაშთი:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {lowStock && (
                        <AlertTriangle className="size-4 text-[var(--status-expired)] animate-pulse" />
                      )}
                      <span className={cn("font-mono font-extrabold", lowStock && "text-[var(--status-expired)]")}>
                        {stock} ცალი
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {displayedProducts.length === 0 && (
            <div className="col-span-full py-20 text-center flex flex-col items-center justify-center gap-4 nm-inset rounded-[2rem] border-white/5 mx-2 my-4">
              <PackageSearch className="size-16 text-muted-foreground/20" />
              <div className="space-y-1">
                <p className="font-extrabold text-foreground/80">პროდუქტები ვერ მოიძებნა</p>
                <p className="text-sm text-muted-foreground/60">ამატეთ ახალი პროდუქტები ბარკოდით ან ხელით</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddCategoryModal open={catModalOpen} onClose={() => setCatModalOpen(false)} parentCategories={categories} onSaved={fetchAll} />
      <ProductModal
        open={prodModalOpen || editingProduct !== null}
        onClose={() => { setProdModalOpen(false); setEditingProduct(null); setScannedBarcode(''); }}
        categories={categories}
        product={editingProduct}
        initialBarcode={scannedBarcode}
        onSaved={fetchAll}
      />

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScan} />
    </div>
  )
}

function AddCategoryModal({ open, onClose, parentCategories, onSaved }: { open: boolean; onClose: () => void; parentCategories: BarCategory[]; onSaved: () => void }) {
  const { pushToast } = usePlayroom()
  const { currentOrgId } = useOrg()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('none')

  const handleSave = async () => {
    if (!name.trim()) return pushToast('danger', 'დასახელება სავალდებულოა')
    if (!currentOrgId) return
    const { error } = await supabase.from('bar_categories').insert({
      org_id: currentOrgId,
      name: name.trim(),
      parent_id: parentId === 'none' ? null : Number(parentId),
    })
    if (error) return pushToast('danger', error.message)
    pushToast('success', 'კატეგორია დაემატა')
    setName('')
    setParentId('none')
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="კატეგორიის დამატება">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">დასახელება</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="მაგ: ენერგეტიკული"
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none"
          />
        </label>
        
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">მშობელი კატეგორია (არასავალდებულო)</span>
          <select
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none appearance-none bg-transparent"
          >
            <option value="none" className="bg-background">-- მთავარი კატეგორია --</option>
            {parentCategories.map(c => (
              <option key={c.id} value={c.id} className="bg-background">{c.name}</option>
            ))}
          </select>
        </label>

        <button onClick={handleSave} className="nm-daylight mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-primary">
          <Save className="size-4" /> შენახვა
        </button>
      </div>
    </Modal>
  )
}

function ProductModal({ open, onClose, categories, product, initialBarcode, onSaved }: { open: boolean; onClose: () => void; categories: BarCategory[]; product?: BarProduct | null; initialBarcode?: string; onSaved: () => void }) {
  const { pushToast } = usePlayroom()
  const { currentOrgId } = useOrg()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [price, setPrice] = useState('0')
  const [costPrice, setCostPrice] = useState('0')
  const [stock, setStock] = useState('0')
  const [barcode, setBarcode] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  useEffect(() => {
    if (open && product) {
      setName(product.name)
      setCategoryId(String(product.category_id ?? ''))
      setPrice(String(product.price))
      setCostPrice(String(product.cost_price ?? 0))
      setStock(String(product.stock_quantity ?? 0))
      setBarcode(product.barcode ?? '')
      setImgUrl(product.image_url ?? '')
    } else if (open && !product) {
      setName('')
      setCategoryId('')
      setPrice('0')
      setCostPrice('0')
      setStock('0')
      setBarcode(initialBarcode ?? '')
      setImgUrl('')
    }
  }, [open, product, initialBarcode])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      return pushToast('danger', 'მხოლოდ jpg/png/webp/gif ფორმატებია დაშვებული')
    }
    if (file.size > 5 * 1024 * 1024) {
      return pushToast('danger', 'ფაილის ზომა არ უნდა აღემატებოდეს 5MB-ს')
    }

    try {
      setIsUploading(true)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) throw new Error('unauthorized')

      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'products')

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
        },
        body: fd,
      })

      const data = await res.json()
      if (!data.ok) {
        throw new Error(data.error || 'upload_failed')
      }

      setImgUrl(data.url)
      pushToast('success', 'ფოტო წარმატებით აიტვირთა')
    } catch (err: any) {
      const msgs: Record<string, string> = {
        unauthorized: 'ავტორიზაცია ვერ მოხერხდა',
        no_file: 'ფაილი ვერ მოიძებნა',
        unsupported_type: 'მხოლოდ jpg/png/webp/gif ფორმატებია დაშვებული',
        file_too_large: 'ფაილის ზომა არ უნდა აღემატებოდეს 5MB-ს',
      }
      pushToast('danger', msgs[err.message] || 'ატვირთვა ვერ მოხერხდა')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return pushToast('danger', 'დასახელება სავალდებულოა')
    if (!currentOrgId) return
    const payload = {
      org_id: currentOrgId,
      name: name.trim(),
      category_id: categoryId ? Number(categoryId) : null,
      price: Number(price) || 0,
      cost_price: Number(costPrice) || 0,
      stock_quantity: Number(stock) || 0,
      barcode: barcode.trim() || null,
      image_url: imgUrl.trim() || null,
    }
    const { error } = product
      ? await supabase.from('bar_products').update(payload).eq('id', product.id)
      : await supabase.from('bar_products').insert(payload)
    if (error) return pushToast('danger', error.message)
    pushToast('success', product ? 'პროდუქტი განახლდა' : 'პროდუქტი დაემატა')
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? 'რედაქტირება' : 'პროდუქტის დამატება'}>
      <div className="space-y-4 border-b border-white/5 pb-4">
        
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">დასახელება</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="მაგ: Redbull ორიგინალი 0.25L"
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">კატეგორია</span>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none appearance-none bg-transparent"
          >
            <option value="" disabled className="bg-background">-- აირჩიეთ --</option>
            {categories.map(c => (
              <option key={c.id} value={c.id} className="bg-background">{c.name}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">შესყიდვის ფასი (₾)</span>
            <input
              type="number" step="0.1" min="0" value={costPrice}
              onChange={e => setCostPrice(e.target.value)}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">გასაყიდი ფასი (₾)</span>
            <input
              type="number" step="0.1" min="0" value={price}
              onChange={e => setPrice(e.target.value)}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none font-bold text-primary"
            />
          </label>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">საწყისი ნაშთი (ცალი)</span>
            <input
              type="number" min="0" value={stock}
              onChange={e => setStock(e.target.value)}
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">ბარკოდი</span>
            <div className="flex gap-2 mt-2">
              <input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="სკანერი ან კოდი"
                className="nm-inset w-full rounded-xl px-4 py-2.5 text-sm outline-none text-primary font-mono"
              />
              <button
                type="button"
                title="კამერით სკანირება"
                onClick={() => setScannerOpen(true)}
                className="nm-btn shrink-0 flex items-center justify-center rounded-xl px-3 text-primary transition-colors hover:text-white"
              >
                <ScanLine className="size-4" />
              </button>
            </div>
          </label>
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground">სურათის URL (ფოტო)</span>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              {imgUrl && (
                <div className="relative size-16 shrink-0 rounded-2xl nm-inset p-1.5 overflow-hidden flex items-center justify-center bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl} alt="Preview" className="h-full w-full object-contain rounded-xl drop-shadow-sm" />
                </div>
              )}
              
              <label className={cn(
                "nm-btn flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold cursor-pointer transition-colors max-w-[200px]",
                isUploading ? "opacity-60 cursor-not-allowed" : "hover:text-primary text-foreground/80"
              )}>
                {isUploading ? (
                  <div className="size-4 shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImagePlus className="size-4 shrink-0" />
                )}
                {isUploading ? 'იტვირთება...' : 'ფოტოს ატვირთვა'}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>

            <input
              value={imgUrl}
              onChange={e => setImgUrl(e.target.value)}
              placeholder="ან შეიყვანეთ URL: https://..."
              className="nm-inset w-full rounded-xl px-4 py-2.5 text-sm outline-none"
            />
          </div>
        </div>

      </div>
      <button onClick={handleSave} className="nm-daylight mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-primary">
        <Save className="size-4" /> შენახვა
      </button>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={code => setBarcode(code)} />
    </Modal>
  )
}
