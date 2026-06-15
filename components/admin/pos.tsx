'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Banknote, CreditCard, Landmark, Plus, Minus, X, Coffee, ShoppingCart, Printer, ScanLine, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { gel, paymentMethodLabel } from '@/lib/ui'
import { supabase } from '@/lib/supabase/client'
import type { PaymentMethod, Bank } from '@/lib/types'
import { printReceipt, printKitchenTicket } from '@/lib/print'
import { useFiscal } from '@/lib/fiscal'
import { Modal } from './modal'
import dynamic from 'next/dynamic'

const BarcodeScanner = dynamic(() => import('./barcode-scanner'), { ssr: false })

// Types (falling back to manual types if lib/database.types.ts is not regenerated)
interface BarCategory { id: number; name: string; sort_order: number; is_active: boolean }
interface BarProduct { id: number; category_id: number | null; name: string; price: number; is_active: boolean; barcode?: string; image_url?: string }
interface BarSale { id: string; total: number; payment_method: string; bank: string | null; created_at: string; voided_at?: string | null }
interface CartItem { product: BarProduct; qty: number }

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowLeftRight,
}
const BANKS: Bank[] = ['TBC', 'BOG']

export function Pos() {
  const { currentOrgId, currentVenueId, currentRole } = useOrg()
  const canVoidRefund = ['owner', 'admin', 'manager'].includes(currentRole ?? '')
  const { pushToast, consoles } = usePlayroom()

  const { fiscalEnabled, issueReceipt } = useFiscal()

  const [categories, setCategories] = useState<BarCategory[]>([])
  const [products, setProducts] = useState<BarProduct[]>([])
  const [sales, setSales] = useState<BarSale[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  
  const [cart, setCart] = useState<CartItem[]>([])
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [bank, setBank] = useState<Bank>('TBC')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [attachedSessionId, setAttachedSessionId] = useState<string>('')
  const [tip, setTip] = useState(0)
  
  const [voidModalOpen, setVoidModalOpen] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [isVoiding, setIsVoiding] = useState(false)
  
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  const handleScan = (code: string) => {
    const match = products.find(x => x.barcode === code)
    if (match) {
      addToCart(match)
      pushToast('success', `${match.name} დაემატა`)
    } else {
      pushToast('danger', 'პროდუქტი ამ ბარკოდით ვერ მოიძებნა')
    }
  }

  const handleVoid = async () => {
    if (!selectedSaleId) return
    setIsVoiding(true)
    const { error } = await supabase.rpc('void_bar_sale', {
      p_sale_id: selectedSaleId,
      p_reason: voidReason.trim() || undefined,
    })
    setIsVoiding(false)

    if (error) {
      if (error.message.includes('already_voided')) pushToast('danger', 'ეს გაყიდვა უკვე გაუქმებულია')
      else if (error.message.includes('not_found')) pushToast('danger', 'გაყიდვა ვერ მოიძებნა')
      else if (error.message.includes('insufficient_privilege')) pushToast('danger', 'ამ ოპერაციის უფლება არ გაქვთ')
      else pushToast('danger', 'შეცდომა. სცადეთ თავიდან.')
    } else {
      pushToast('success', 'გაყიდვა გაუქმებულია')
      setVoidModalOpen(false)
      fetchSales()
    }
  }

  const openVoidModal = (id: string) => {
    setSelectedSaleId(id)
    setVoidReason('')
    setVoidModalOpen(true)
  }

  const activeConsoles = consoles.filter(c => c.active_session)

  const fetchSales = async () => {
    if (!currentVenueId) return
    const { data } = await supabase
      .from('bar_sales')
      .select('*, bar_sale_items(*)')
      .eq('venue_id', currentVenueId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setSales(data as any)
  }

  useEffect(() => {
    if (!currentOrgId) return
    const load = async () => {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('bar_categories').select('*').eq('org_id', currentOrgId).order('sort_order'),
        supabase.from('bar_products').select('*').eq('org_id', currentOrgId).eq('is_active', true).order('name')
      ])
      if (cats) {
        setCategories(cats as any)
        // default to "ყველა" (all) — don't auto-select the first category
      }
      if (prods) setProducts(prods as any)
      
      fetchSales()
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, currentVenueId])

  const displayedProducts = products
    .filter(p => !activeCategoryId || p.category_id === activeCategoryId)
    .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode === searchQuery)

  useEffect(() => {
    let buffer = ''
    let lastTime = 0
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing inside input manually, except if scanner is so fast it just fires
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      const time = Date.now()
      if (time - lastTime > 100) buffer = '' // Standard scanners fire keys within ~20-50ms
      lastTime = time

      if (e.key === 'Enter') {
        if (buffer.length > 2) {
          const match = products.find(x => x.barcode === buffer)
          if (match) {
            addToCart(match)
            pushToast('success', `${match.name} დაემატა`)
          } else {
            pushToast('danger', 'პროდუქტი ბარკოდით ვერ მოიძებნა')
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

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0)

  const addToCart = (product: BarProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.product.id === id) {
        const newQty = Math.max(0, i.qty + delta)
        return { ...i, qty: newQty }
      }
      return i
    }).filter(i => i.qty > 0))
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (!currentVenueId) {
      pushToast('danger', 'ფილიალი არ არის არჩეული')
      return
    }

    setLoading(true)
    const items = cart.map(i => ({ product_id: i.product.id, qty: i.qty }))
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.rpc('create_bar_sale', {
      p_venue_id: currentVenueId,
      p_payment_method: attachedSessionId ? 'cash' : method, // Or backend uses tab logic
      p_bank: attachedSessionId || method === 'cash' ? undefined : bank,
      p_items: items,
      p_customer_name: undefined,
      p_session_id: attachedSessionId || undefined,
      p_tip: tip,
    } as any)

    setLoading(false)

    if (error) {
      pushToast('danger', error.message)
    } else {
      pushToast('success', attachedSessionId ? 'გაყიდვა მიება ღია სესიას' : 'გაყიდვა წარმატებით შესრულდა')
      if (fiscalEnabled) {
        await issueReceipt(
          cart.map(i => ({ name: i.product.name, qty: i.qty, unitPrice: i.product.price })),
          cartTotal,
          paymentMethodLabel[method],
        )
      } else {
        printReceipt({
          venueName: 'Playroom Gaming Lounge',
          date: new Date().toLocaleString('ka-GE'),
          items: cart.map(i => ({ label: `${i.qty}× ${i.product.name}`, value: gel(i.product.price * i.qty) })),
          total: gel(cartTotal),
          paymentMethod: paymentMethodLabel[method],
        })
      }
      setCart([])
      setCartSheetOpen(false)
      setMethod('cash')
      setAttachedSessionId('')
      setTip(0)
      fetchSales()
    }
  }

  const cartPanel = (
    <div className="nm-raised flex h-fit flex-col rounded-[2rem] p-5">
      <div className="mb-6 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <ShoppingCart className="size-5 text-primary" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">კალათა</h2>
      </div>

      <div className="mb-6 min-h-[120px] flex-1 space-y-3">
        {cart.length === 0 ? (
          <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
            კალათა ცარიელია
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.product.id} className="nm-inset group flex items-center justify-between rounded-2xl p-3 transition-colors hover:bg-white/[0.02]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="nm-raised size-10 shrink-0 rounded-lg p-1.5 flex items-center justify-center overflow-hidden">
                  {item.product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.product.image_url} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                  ) : (
                    <Coffee className="size-5 text-muted-foreground/30" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-sm text-foreground/90">{item.product.name}</p>
                  <p className="mt-0.5 text-xs font-black text-primary">{gel(item.product.price)}</p>
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                <button
                  onClick={() => updateQty(item.product.id, -1)}
                  className="nm-btn flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
                >
                  <Minus className="size-3" />
                </button>
                <span className="min-w-[24px] text-center text-sm font-bold tabular-nums">
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(item.product.id, 1)}
                  className="nm-btn flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
                >
                  <Plus className="size-3" />
                </button>
                <button
                  onClick={() => updateQty(item.product.id, -item.qty)}
                  className="ml-1 flex size-8 items-center justify-center rounded-xl text-muted-foreground/50 hover:text-[var(--status-expired)] hover:bg-white/[0.05] transition-colors"
                  title="ამოშლა"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment Method Selector & Unified Tabs */}
      <div className="mb-6 space-y-4">
        {activeConsoles.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              მიბმა ოთახზე / სესიაზე (Optional)
            </p>
            <select
              value={attachedSessionId}
              onChange={e => setAttachedSessionId(e.target.value)}
              className="nm-inset w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none appearance-none bg-transparent"
            >
              <option value="" className="bg-background">-- არცერთზე (პირდაპირი გადახდა) --</option>
              {activeConsoles.map(c => (
                <option key={c.active_session!.id} value={c.active_session!.id} className="bg-background">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!attachedSessionId && (
          <div>
            <p className="mb-3 text-sm font-semibold text-muted-foreground">
              გადახდის მეთოდი
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => {
                const Icon = METHOD_ICON[m]
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-bold',
                      m === method ? 'nm-daylight text-primary' : 'nm-btn',
                    )}
                  >
                    <Icon className="size-4" />
                    {paymentMethodLabel[m]}
                  </button>
                )
              })}
            </div>
            {method !== 'cash' ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">ბანკი</p>
                <div className="grid grid-cols-2 gap-2">
                  {BANKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBank(b)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold',
                        b === bank ? 'nm-daylight text-primary' : 'nm-btn',
                      )}
                    >
                      <Landmark className="size-4" />
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <label className="mb-4 block">
        <span className="text-sm font-semibold text-muted-foreground">ჩაიანი (₾)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={tip || ''}
          onChange={(e) => setTip(Number(e.target.value))}
          className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-primary"
        />
      </label>

      {/* Total & Checkout */}
      <div className="nm-inset mb-4 flex flex-col gap-1 rounded-2xl px-4 py-3">
        {tip > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">ჩაიანი:</span>
            <span className="font-mono text-sm font-bold text-amber-400">{gel(tip)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-muted-foreground">ჯამი</span>
          <span className="font-mono text-2xl font-extrabold text-primary tabular-nums">
            {gel(cartTotal + tip)}
          </span>
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={cart.length === 0 || loading}
        className={cn(
          "nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-extrabold text-primary",
          (cart.length === 0 || loading) && "opacity-50"
        )}
      >
        <ShoppingCart className="size-4" />
        გადახდა {loading && "..."}
      </button>
      <button
        onClick={() => printKitchenTicket(cart.map(i => ({ name: i.product.name, qty: i.qty })), attachedSessionId ? 'ოთახი (სესია)' : 'ბარი')}
        disabled={cart.length === 0}
        className={cn(
          "nm-btn mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-muted-foreground",
          cart.length === 0 && "opacity-40"
        )}
      >
        <Printer className="size-4" />
        ბარის ჩეკი (Kitchen)
      </button>
    </div>
  )

  return (
    <div className={cn('flex w-full flex-col gap-6 lg:flex-row', cart.length > 0 && 'pb-24 lg:pb-0')}>
      <div className="flex flex-1 flex-col gap-6">
        {/* Categories & Search */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 w-full">
            <input
              type="search"
              placeholder="🔍 ძებნა სახელუს ან ბარკოდის მიხედვით..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="nm-inset w-full rounded-2xl px-5 py-4 text-sm font-semibold outline-none placeholder:text-muted-foreground flex-1"
            />
            <button
              onClick={() => setScannerOpen(true)}
              className="nm-btn flex shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-primary transition-colors hover:text-white"
              title="კამერით სკანირება"
            >
              <ScanLine className="size-5" />
              <span className="hidden sm:inline">კამერით სკანირება</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategoryId(null)}
              className={cn(
                'rounded-2xl px-5 py-3 text-sm font-bold transition-all',
                activeCategoryId === null ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground'
              )}
            >
              ყველა
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategoryId(c.id)}
                className={cn(
                  'rounded-2xl px-5 py-3 text-sm font-bold transition-all',
                  activeCategoryId === c.id ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {displayedProducts.map(p => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="nm-btn group flex flex-col gap-3 rounded-3xl p-3 transition-all duration-300 hover:-translate-y-2"
            >
              <div className="nm-inset relative w-full aspect-square overflow-hidden rounded-2xl p-4 flex items-center justify-center">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-110" />
                ) : (
                  <Coffee className="size-12 text-primary/30 transition-transform duration-300 group-hover:scale-110 group-hover:text-primary/60" />
                )}
              </div>
              <div className="pb-2 w-full text-center flex flex-col justify-between flex-1">
                <p className="text-sm font-extrabold leading-tight text-foreground/90 group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5rem] flex items-center justify-center">
                  {p.name}
                </p>
                <div className="mt-2 flex items-center justify-center">
                  <span className="nm-inset px-3 py-1 rounded-full text-sm font-black text-primary transition-all duration-300 group-hover:shadow-[0_0_12px_rgba(var(--primary),0.3)]">
                    {gel(p.price)}
                  </span>
                </div>
              </div>
            </button>
          ))}
          {displayedProducts.length === 0 && (
            <div className="col-span-full py-20 text-center flex flex-col items-center justify-center gap-4 nm-inset rounded-[2rem] border-white/5 mx-2 my-4">
              <Coffee className="size-16 text-muted-foreground/20" />
              <div className="space-y-1">
                <p className="font-extrabold text-foreground/80">პროდუქტები ვერ მოიძებნა</p>
                <p className="text-sm text-muted-foreground/60">აირჩიეთ სხვა კატეგორია ან შეცვალეთ ძებნის პარამეტრი</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent sales */}
        <div className="mt-4">
          <h3 className="mb-4 text-sm font-bold text-muted-foreground">დღევანდელი გაყიდვები</h3>
          <div className="space-y-3">
            {sales.length === 0 ? (
              <p className="nm-inset rounded-2xl p-4 text-center text-sm text-muted-foreground">გაყიდვები არ არის</p>
            ) : (
              sales.map(s => {
                const SaleIcon = METHOD_ICON[s.payment_method as PaymentMethod] || Banknote
                const isVoided = !!s.voided_at
                return (
                  <div key={s.id} className="nm-inset flex items-center justify-between rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-background/50">
                        <SaleIcon className="size-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className={cn("font-bold", isVoided && "line-through text-muted-foreground")}>{gel(s.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' })}
                          {' • '}
                          {paymentMethodLabel[s.payment_method as PaymentMethod]}
                          {s.bank ? ` (${s.bank})` : ''}
                        </p>
                      </div>
                    </div>
                    {isVoided ? (
                      <span className="nm-inset px-2 py-0.5 rounded-lg text-xs text-red-400">გაუქმებული</span>
                    ) : canVoidRefund ? (
                      <button
                        onClick={() => openVoidModal(s.id)}
                        className="nm-btn rounded-xl px-2 py-1 text-xs text-red-400 font-bold"
                      >
                        გაუქმება
                      </button>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Cart — desktop sidebar (mobile uses the sticky bar + sheet below) */}
      <div className="hidden w-full flex-col gap-6 lg:flex lg:w-[360px] xl:w-[420px]">
        <div className="nm-raised flex h-fit flex-col rounded-[2rem] p-5">
          <div className="mb-6 flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <ShoppingCart className="size-5 text-primary" />
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">კალათა</h2>
          </div>

          <div className="mb-6 min-h-[200px] flex-1 space-y-3">
            {cart.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                კალათა ცარიელია
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="nm-inset group flex items-center justify-between rounded-2xl p-3 transition-colors hover:bg-white/[0.02]">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="nm-raised size-10 shrink-0 rounded-lg p-1.5 flex items-center justify-center overflow-hidden">
                      {item.product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.product.image_url} alt="" className="w-full h-full object-contain drop-shadow-sm" />
                      ) : (
                        <Coffee className="size-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-sm text-foreground/90">{item.product.name}</p>
                      <p className="mt-0.5 text-xs font-black text-primary">{gel(item.product.price)}</p>
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => updateQty(item.product.id, -1)}
                      className="nm-btn flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="min-w-[24px] text-center text-sm font-bold tabular-nums">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.product.id, 1)}
                      className="nm-btn flex size-8 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      onClick={() => updateQty(item.product.id, -item.qty)}
                      className="ml-1 flex size-8 items-center justify-center rounded-xl text-muted-foreground/50 hover:text-[var(--status-expired)] hover:bg-white/[0.05] transition-colors"
                      title="ამოშლა"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method Selector & Unified Tabs */}
          <div className="mb-6 space-y-4">
            
            {activeConsoles.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">
                  მიბმა ოთახზე / სესიაზე (Optional)
                </p>
                <select
                  value={attachedSessionId}
                  onChange={e => setAttachedSessionId(e.target.value)}
                  className="nm-inset w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none appearance-none bg-transparent"
                >
                  <option value="" className="bg-background">-- არცერთზე (პირდაპირი გადახდა) --</option>
                  {activeConsoles.map(c => (
                    <option key={c.active_session!.id} value={c.active_session!.id} className="bg-background">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!attachedSessionId && (
              <div>
                <p className="mb-3 text-sm font-semibold text-muted-foreground">
                  გადახდის მეთოდი
                </p>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => {
                const Icon = METHOD_ICON[m]
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-bold',
                      m === method ? 'nm-daylight text-primary' : 'nm-btn',
                    )}
                  >
                    <Icon className="size-4" />
                    {paymentMethodLabel[m]}
                  </button>
                )
              })}
            </div>
            {method !== 'cash' ? (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">ბანკი</p>
                <div className="grid grid-cols-2 gap-2">
                  {BANKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBank(b)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold',
                        b === bank ? 'nm-daylight text-primary' : 'nm-btn',
                      )}
                    >
                      <Landmark className="size-4" />
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
              </div>
            )}

          </div>

          <label className="mb-4 block">
            <span className="text-sm font-semibold text-muted-foreground">ჩაიანი (₾)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={tip || ''}
              onChange={(e) => setTip(Number(e.target.value))}
              className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none text-primary"
            />
          </label>

          {/* Total & Checkout */}
          <div className="nm-inset mb-4 flex flex-col gap-1 rounded-2xl px-4 py-3">
            {tip > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">ჩაიანი:</span>
                <span className="font-mono text-sm font-bold text-amber-400">{gel(tip)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-muted-foreground">ჯამი</span>
              <span className="font-mono text-2xl font-extrabold text-primary">
                {gel(cartTotal + tip)}
              </span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || loading}
            className={cn(
              "nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-extrabold text-primary",
              (cart.length === 0 || loading) && "opacity-50"
            )}
          >
            <ShoppingCart className="size-4" />
            გადახდა {loading && "..."}
          </button>
          <button
            onClick={() => printKitchenTicket(cart.map(i => ({ name: i.product.name, qty: i.qty })), attachedSessionId ? 'ოთახი (სესია)' : 'ბარი')}
            disabled={cart.length === 0}
            className={cn(
              "nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-muted-foreground",
              cart.length === 0 && "opacity-40"
            )}
          >
            <Printer className="size-4" />
            ბარის ჩეკი (Kitchen)
          </button>
        </div>
      </div>

      {/* Cart — mobile sticky bar (collapsed) → expands into a bottom sheet */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="nm-raised fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-2xl px-5 py-3.5 lg:hidden"
        >
          <span className="relative flex items-center gap-3">
            <ShoppingCart className="size-5 text-primary" />
            <span className="absolute -left-1.5 -top-2 flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-[var(--primary-foreground)]">
              {cartCount}
            </span>
            <span className="font-mono text-lg font-extrabold text-primary tabular-nums">{gel(cartTotal + tip)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-primary">
            გაყიდვა <ChevronUp className="size-4" />
          </span>
        </button>
      )}

      {cartSheetOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setCartSheetOpen(false)} />
          <div className="relative max-h-[92dvh] overflow-y-auto rounded-t-[2rem] bg-background p-3 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom-full duration-300">
            <button
              onClick={() => setCartSheetOpen(false)}
              className="nm-btn absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-xl text-muted-foreground"
              aria-label="დახურვა"
            >
              <X className="size-4" />
            </button>
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            {cartPanel}
          </div>
        </div>,
        document.body,
      )}

      <Modal open={voidModalOpen} onClose={() => setVoidModalOpen(false)} title="გაყიდვის გაუქმება">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-muted-foreground">მიზეზი</span>
            <input
              type="text"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none text-primary"
            />
          </label>
          <button
            onClick={handleVoid}
            disabled={isVoiding}
            className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-red-400"
          >
            გაუქმება
          </button>
        </div>
      </Modal>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  )
}
