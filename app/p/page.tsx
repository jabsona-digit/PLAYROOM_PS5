'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { Gamepad2, Clock, Coffee, Plus, Minus, Send, CheckCircle2, Bell, BatteryWarning, AlertTriangle, KeyRound, ScanLine, Boxes } from 'lucide-react'
import { gel } from '@/lib/ui'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

// portal_* RPCs ship in migration 0057; the generated DB types regenerate on
// deploy, so call through a loose wrapper until then.
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>)(fn, args)

interface Category { id: number; name: string }
interface Product { id: number; category_id: number | null; name: string; price: number; stock?: number | null }
interface CartItem { id: number; name: string; qty: number; price: number }

const UNCATEGORIZED = -1

function PortalApp() {
  const params = useSearchParams()
  const venueId = params.get('v')
  const consoleId = params.get('c')
  const codeParam = params.get('k') // session QR embeds the access code as &k=

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [venueName, setVenueName] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null)

  // session
  const [consoleName, setConsoleName] = useState<string | null>(null)
  const [consoleType, setConsoleType] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState(false)
  const [endsAt, setEndsAt] = useState<string | null>(null)
  const [planName, setPlanName] = useState<string | null>(null)
  const [controllers, setControllers] = useState<number | null>(null)
  const [pricePerHour, setPricePerHour] = useState<number | null>(null)
  const [bill, setBill] = useState<{
    play_amount: number; play_paid: boolean
    paid_items: { name: string; qty: number; line_total: number }[]; paid_bar_total: number
    tab_items: { name: string; qty: number; line_total: number }[]; tab_total: number
    grand_total: number
  } | null>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [busy, setBusy] = useState(false)
  const [successType, setSuccessType] = useState<'order' | 'battery' | 'call' | 'equipment' | 'extend' | null>(null)
  const [extendOpen, setExtendOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // per-session access gate — proves this device holds the CURRENT session's
  // code (typed PIN or scanned from a session QR's &k=). Rotates each session.
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [pinError, setPinError] = useState(false)

  // live countdown clock
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => setMounted(true), [])

  const loadSession = useCallback(async () => {
    if (!consoleId) return
    const { data, error } = await rpc('portal_get_session_status', { p_console_id: Number(consoleId) })
    if (error || !data || data.error) return
    setConsoleName(data.console_name ?? null)
    setConsoleType(data.console_type ?? null)
    const active = !!data.active
    setSessionActive(active)
    setEndsAt(active ? data.ends_at : null)
    setPlanName(active ? data.plan_name : null)
    setControllers(active ? (data.controllers ?? null) : null)
    setPricePerHour(active ? (data.price_per_hour ?? null) : null)
    // session ended → drop any unlocked access (the code dies with the session)
    if (!active) {
      setUnlocked(false)
      setCode(null)
      try { sessionStorage.removeItem(`inseat_code_${consoleId}`) } catch {}
    }
  }, [consoleId])

  // Verify a candidate code against the live session; on success unlock + persist.
  const tryUnlock = useCallback(async (candidate: string): Promise<boolean> => {
    if (!venueId || !consoleId || !candidate) return false
    setVerifying(true)
    const { data, error } = await rpc('portal_unlock', {
      p_venue_id: venueId,
      p_console_id: Number(consoleId),
      p_code: candidate,
    })
    setVerifying(false)
    if (error || !data?.ok) {
      if (data?.error === 'bad_code') setPinError(true)
      return false
    }
    setUnlocked(true)
    setCode(candidate)
    setConsoleName(data.console_name ?? null)
    setConsoleType(data.console_type ?? null)
    setSessionActive(true)
    setEndsAt(data.ends_at ?? null)
    setPlanName(data.plan_name ?? null)
    setControllers(data.controllers ?? null)
    setPricePerHour(data.price_per_hour ?? null)
    try { sessionStorage.setItem(`inseat_code_${consoleId}`, candidate) } catch {}
    return true
  }, [venueId, consoleId])

  // live running bill (play + bar paid/owed) — needs the session code to read
  const loadBill = useCallback(async (c: string | null) => {
    if (!consoleId || !c) return
    const { data, error } = await rpc('portal_get_bill', { p_console_id: Number(consoleId), p_code: c })
    if (error || !data || data.error) return
    setBill(data)
  }, [consoleId])

  const relock = () => {
    setUnlocked(false)
    setCode(null)
    setBill(null)
    setPinInput('')
    try { sessionStorage.removeItem(`inseat_code_${consoleId}`) } catch {}
  }

  // refresh the bill on unlock + every 20s while unlocked
  useEffect(() => {
    if (!unlocked || !code) { setBill(null); return }
    loadBill(code)
    const iv = setInterval(() => loadBill(code), 20_000)
    return () => clearInterval(iv)
  }, [unlocked, code, loadBill])

  // initial load: menu + session
  useEffect(() => {
    if (!venueId || !consoleId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data, error } = await rpc('portal_get_menu', { p_venue_id: venueId })
      if (cancelled) return
      if (error || !data || data.error) {
        setLoadError(true)
        setLoading(false)
        return
      }
      const cats: Category[] = data.categories ?? []
      const prods: Product[] = data.products ?? []
      setVenueName(data.venue_name ?? '')
      setCategories(cats)
      setProducts(prods)
      const hasUncategorized = prods.some((p) => !p.category_id)
      const firstTab = cats[0]?.id ?? (hasUncategorized ? UNCATEGORIZED : null)
      setActiveTab(firstTab)
      setLoading(false)
      await loadSession()
      // auto-unlock: scanned session QR (&k=) wins, else a code kept from earlier
      let stored: string | null = null
      try { stored = sessionStorage.getItem(`inseat_code_${consoleId}`) } catch {}
      const initCode = codeParam || stored
      if (initCode) await tryUnlock(initCode)
    })()
    return () => { cancelled = true }
  }, [venueId, consoleId, codeParam, loadSession, tryUnlock])

  // keep the session timer honest (operator may extend/end it)
  useEffect(() => {
    if (!venueId || !consoleId) return
    const iv = setInterval(loadSession, 20_000)
    return () => clearInterval(iv)
  }, [venueId, consoleId, loadSession])

  const flashError = (msg: string) => {
    setErrorMsg(msg)
    setTimeout(() => setErrorMsg(null), 4000)
  }

  const addToCart = (p: Product) => {
    if (!unlocked) { flashError(orderErrorText('no_active_session')); return }
    if (p.stock != null && p.stock <= 0) { flashError(`${p.name} — მარაგი ამოიწურა`); return }
    const have = cart.find((i) => i.id === p.id)?.qty ?? 0
    if (p.stock != null && have >= p.stock) { flashError(`${p.name} — მარაგში მხოლოდ ${p.stock}-ია`); return }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id)
      if (existing) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1 }]
    })
  }

  const updateQty = (id: number, delta: number) => {
    if (delta > 0) {
      const stock = products.find((p) => p.id === id)?.stock
      const have = cart.find((i) => i.id === id)?.qty ?? 0
      if (stock != null && have >= stock) { flashError(`მარაგში მხოლოდ ${stock}-ია`); return }
    }
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0))
  }

  const orderErrorText = (code?: string) => {
    switch (code) {
      case 'too_many_pending': return 'ბევრი შეკვეთა გაქვთ მოლოდინში. დაელოდეთ ოპერატორს.'
      case 'venue_unavailable': return 'კლუბი ამჟამად მიუწვდომელია.'
      case 'product_unavailable': return 'ზოგი პროდუქტი აღარ არის ხელმისაწვდომი. განაახლეთ გვერდი.'
      case 'insufficient_stock': return 'პროდუქტი მარაგში აღარ არის საკმარისი. შეამცირეთ რაოდენობა.'
      case 'no_active_session': return 'სესია არ არის აქტიური. შეკვეთა და მოთხოვნა ხელმისაწვდომია მხოლოდ თამაშის დროს — მიმართეთ ოპერატორს.'
      case 'bad_code': return 'კოდი არასწორია ან ვადაგასულია. შეიყვანეთ ხელახლა.'
      case 'rate_limited': return 'ბევრი მცდელობა იყო. დაელოდეთ ერთ წუთს.'
      case 'console_mismatch':
      case 'venue_not_found': return 'არასწორი QR კოდი.'
      default: return 'შეცდომა. სცადეთ თავიდან.'
    }
  }

  const handleOrder = async () => {
    if (cart.length === 0 || !venueId || !consoleId) return
    if (!unlocked || !code) { flashError(orderErrorText('no_active_session')); return }
    setBusy(true)
    const { data, error } = await rpc('portal_place_order', {
      p_venue_id: venueId,
      p_console_id: Number(consoleId),
      p_items: cart.map((i) => ({ product_id: i.id, qty: i.qty })),
      p_code: code,
    })
    setBusy(false)
    if (error || !data?.ok) {
      if (data?.error === 'bad_code') relock()
      if (data?.error === 'insufficient_stock') {
        flashError(`${data.product ?? 'პროდუქტი'} — მარაგში მხოლოდ ${data.available}-ია`)
      } else {
        flashError(orderErrorText(data?.error))
      }
      // stock may have moved under us — refresh the menu so badges/caps are honest
      rpc('portal_get_menu', { p_venue_id: venueId }).then(({ data: m }) => {
        if (m && !m.error && Array.isArray(m.products)) setProducts(m.products as Product[])
      })
      return
    }
    setCart([])
    setSuccessType('order')
    setTimeout(() => setSuccessType(null), 3500)
  }

  const requestExtend = async (minutes: number) => {
    if (!venueId || !consoleId || !code) { flashError(orderErrorText('no_active_session')); return }
    setBusy(true)
    const { data, error } = await rpc('portal_request_extend', {
      p_venue_id: venueId, p_console_id: Number(consoleId), p_code: code, p_minutes: minutes,
    })
    setBusy(false)
    setExtendOpen(false)
    if (error || !data?.ok) {
      if (data?.error === 'bad_code') relock()
      flashError(orderErrorText(data?.error)); return
    }
    setSuccessType('extend')
    setTimeout(() => setSuccessType(null), 3500)
  }

  const handleServiceRequest = async (kind: 'battery' | 'call' | 'equipment') => {
    if (!venueId || !consoleId) return
    if (!unlocked || !code) { flashError(orderErrorText('no_active_session')); return }
    setBusy(true)
    const { data, error } = await rpc('portal_request_service', {
      p_venue_id: venueId,
      p_console_id: Number(consoleId),
      p_kind: kind,
      p_code: code,
    })
    setBusy(false)
    if (error || !data?.ok) {
      if (data?.error === 'bad_code') relock()
      flashError(orderErrorText(data?.error))
      return
    }
    setSuccessType(kind)
    setTimeout(() => setSuccessType(null), 3500)
  }

  const cartTotal = cart.reduce((acc, i) => acc + i.price * i.qty, 0)

  const remainingMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - nowTs) : 0
  const remMin = Math.floor(remainingMs / 60000)
  const remSec = Math.floor((remainingMs % 60000) / 1000)
  const clock = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`

  const visibleProducts = products.filter((p) =>
    activeTab === UNCATEGORIZED ? !p.category_id : p.category_id === activeTab,
  )
  const tabs: Category[] = [
    ...categories,
    ...(products.some((p) => !p.category_id) ? [{ id: UNCATEGORIZED, name: 'სხვა' }] : []),
  ]

  if (!mounted) return null

  if (!venueId || !consoleId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-center p-6 text-muted-foreground">
        <p>არასწორი QR კოდი. გთხოვთ დაასკანეროთ კონსოლზე არსებული კოდი.</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center p-6 gap-3 text-muted-foreground">
        <AlertTriangle className="size-10 text-amber-400" />
        <p>კლუბი ვერ მოიძებნა ან დროებით მიუწვდომელია.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background text-foreground pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 nm-raised p-4 rounded-b-3xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="nm-inset size-12 flex items-center justify-center rounded-2xl">
            <Gamepad2 className="size-6 text-primary stroke-[1.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black">{consoleName ?? `PS5 - ${consoleId}`}</h1>
            <p className="text-xs text-muted-foreground font-bold tracking-wider uppercase">
              {venueName || 'In-Seat Ordering'}
            </p>
          </div>
        </div>
      </header>

      {/* Session Widget */}
      <div className="p-4 mt-2">
        <div className="nm-raised rounded-3xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-[100px] pointer-events-none" />
          <div className="flex items-center gap-2 mb-2 text-primary font-bold">
            <Clock className="size-5" />
            {sessionActive ? 'მიმდინარე სესია' : 'სესია არ არის აქტიური'}
          </div>
          {sessionActive ? (
            <>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">დარჩენილი დრო</p>
                  <p className="text-4xl font-mono font-black mt-1">{clock}</p>
                  {planName ? <p className="mt-1 text-xs text-muted-foreground font-bold">{planName}</p> : null}
                </div>
                {unlocked && (
                  extendOpen ? (
                    <div className="flex items-center gap-1.5">
                      {[15, 30, 60].map((m) => (
                        <button
                          key={m}
                          onClick={() => requestExtend(m)}
                          disabled={busy}
                          className="nm-daylight rounded-xl px-3 py-2.5 text-xs font-black text-primary disabled:opacity-50"
                        >
                          +{m}′
                        </button>
                      ))}
                      <button onClick={() => setExtendOpen(false)} className="px-1 text-xs text-muted-foreground">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExtendOpen(true)}
                      disabled={busy}
                      className="nm-daylight px-5 py-2.5 rounded-xl text-xs font-bold text-primary whitespace-nowrap disabled:opacity-50"
                    >
                      დროის გაგრძელება
                    </button>
                  )
                )}
              </div>

              {/* What you're paying for — customer verification (anti-fraud).
                  Playroom: show the joystick count so the customer spots an
                  under-rung tier (charged for 2 but playing with 4). */}
              {controllers != null && controllers > 0 && consoleType !== 'billiard' && consoleType !== 'snooker' && (
                <div className="nm-inset mt-4 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-black">
                      <Gamepad2 className="size-4 text-primary" />
                      {controllers} ჯოისტიკი
                    </span>
                    {pricePerHour != null && (
                      <span className="font-mono text-sm font-black text-primary">{gel(pricePerHour)} / სთ</span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    ⚠️ ირიცხები <b className="text-foreground">{controllers} ჯოისტიკზე</b>. თუ მეტი ჯოისტიკით თამაშობ — აცნობე ოპერატორს ან გამოიძახე სტაფი.
                  </p>
                </div>
              )}

              {/* Billiard / other: show the tariff + price (no joystick claim) */}
              {(consoleType === 'billiard' || consoleType === 'snooker') && pricePerHour != null && (
                <div className="nm-inset mt-4 flex items-center justify-between rounded-2xl p-3.5">
                  <span className="text-sm font-bold">{planName ?? 'ტარიფი'}</span>
                  <span className="font-mono text-sm font-black text-primary">{gel(pricePerHour)} / სთ</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              შეკვეთა, დახმარება და სტაფის გამოძახება ხელმისაწვდომია მხოლოდ აქტიური სესიის დროს.
              თამაშის დასაწყებად მიმართეთ ოპერატორს.
            </p>
          )}
        </div>

        {/* My running bill — play + bar (paid green / owed red), settled at session end */}
        {unlocked && bill && (
          <div className="nm-raised rounded-3xl p-5 mt-3">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black">🧾 ჩემი ანგარიში</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className={bill.play_paid ? 'text-green-400' : 'text-red-400'}>
                  {bill.play_paid ? '🟢' : '🔴'} თამაში
                </span>
                <span className="font-mono">{gel(bill.play_amount)}</span>
              </div>
              {bill.paid_items.map((it, i) => (
                <div key={`p${i}`} className="flex justify-between text-green-400">
                  <span>🟢 {it.qty}× {it.name}</span><span className="font-mono">{gel(it.line_total)}</span>
                </div>
              ))}
              {bill.tab_items.map((it, i) => (
                <div key={`t${i}`} className="flex justify-between text-red-400">
                  <span>🔴 {it.qty}× {it.name}</span><span className="font-mono">{gel(it.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-base font-black">
              <span>სულ</span><span className="font-mono text-primary">{gel(bill.grand_total)}</span>
            </div>
            {(bill.tab_total > 0 || !bill.play_paid) && (
              <p className="mt-2 text-[11px] text-red-400">
                🔴 გადასახდელი {gel((bill.play_paid ? 0 : bill.play_amount) + bill.tab_total)} — გადაიხდით სესიის ბოლოს
              </p>
            )}
          </div>
        )}

        {/* Locked: need the CURRENT session's code (typed PIN or scanned QR) */}
        {sessionActive && !unlocked && (
          <div className="nm-raised rounded-3xl p-6 mt-3 text-center">
            <div className="nm-inset mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl">
              <KeyRound className="size-6 text-primary" />
            </div>
            <h3 className="text-lg font-black mb-1">შეიყვანე წვდომის კოდი</h3>
            <p className="text-sm text-muted-foreground mb-5">
              ოპერატორმა მოგცა 6-ნიშნა კოდი — შეიყვანე აქ, ან უბრალოდ დაასკანერე სესიის QR.
            </p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && pinInput.length === 6) tryUnlock(pinInput) }}
              placeholder="••••••"
              className="nm-inset mb-3 w-full rounded-2xl py-4 text-center font-mono text-3xl font-black tracking-[0.4em] outline-none"
            />
            {pinError && <p className="mb-3 text-xs font-bold text-red-400">არასწორი კოდი. სცადე თავიდან.</p>}
            <button
              type="button"
              onClick={() => tryUnlock(pinInput)}
              disabled={verifying || pinInput.length !== 6}
              className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-black text-primary disabled:opacity-50"
            >
              {verifying ? <span className="animate-pulse">მოწმდება...</span> : <><ScanLine className="size-5" /> გახსნა</>}
            </button>
          </div>
        )}

        {/* Quick Service Actions — only once the session code is verified */}
        {unlocked && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {consoleType === 'billiard' || consoleType === 'snooker' ? (
              <button
                onClick={() => handleServiceRequest('equipment')}
                disabled={busy}
                className="nm-raised flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                <Boxes className="size-5 text-[var(--status-warning5)] mb-1.5" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center">
                  ინვენტარი (ცარცი/ბურთები)
                </span>
              </button>
            ) : (
              <button
                onClick={() => handleServiceRequest('battery')}
                disabled={busy}
                className="nm-raised flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                <BatteryWarning className="size-5 text-red-500 mb-1.5" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center">
                  ჯოისტიკი დაჯდა
                </span>
              </button>
            )}
            <button
              onClick={() => handleServiceRequest('call')}
              disabled={busy}
              className="nm-raised flex flex-col items-center justify-center p-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
            >
              <Bell className="size-5 text-[var(--status-free)] mb-1.5" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center">
                სტაფის გამოძახება
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Bar Menu — only once the session code is verified */}
      {unlocked && (
      <div className="flex-1 px-4 mt-2">
        <h2 className="text-sm font-black mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
          <Coffee className="size-4" /> ბარის მენიუ
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="nm-inset h-40 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : tabs.length === 0 ? (
          <div className="nm-inset rounded-3xl p-10 text-center text-sm text-muted-foreground">
            მენიუ ცარიელია.
          </div>
        ) : (
          <>
            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
              {tabs.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={cn(
                    'nm-inset px-6 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-colors',
                    activeTab === cat.id ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              {visibleProducts.map((p) => {
                const soldOut = p.stock != null && p.stock <= 0
                const have = cart.find((i) => i.id === p.id)?.qty ?? 0
                const maxed = p.stock != null && have >= p.stock
                const disabled = soldOut || maxed
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={disabled}
                    className={cn(
                      'nm-raised relative flex flex-col items-center justify-center p-4 rounded-3xl transition-transform',
                      disabled ? 'opacity-50' : 'active:scale-95',
                    )}
                  >
                    {soldOut ? (
                      <span className="absolute right-2 top-2 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-400">გაყიდულია</span>
                    ) : p.stock != null && p.stock <= 5 ? (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-400">დარჩა {p.stock}</span>
                    ) : null}
                    <div className="size-16 nm-inset bg-background/50 rounded-2xl mb-3 flex items-center justify-center text-primary/40">
                      <Coffee className="size-7" />
                    </div>
                    <p className="text-sm font-bold text-center leading-tight mb-1 h-8 line-clamp-2">{p.name}</p>
                    <p className="text-primary font-mono font-black">{gel(p.price)}</p>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      )}

      {/* Error toast */}
      {errorMsg && mounted && createPortal(
        <div className="fixed inset-x-0 bottom-6 z-[200] flex justify-center px-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="nm-raised flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-red-400">
            <AlertTriangle className="size-4 shrink-0" />
            {errorMsg}
          </div>
        </div>,
        document.body,
      )}

      {/* Bottom Cart Sheet */}
      {cart.length > 0 && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setCart([])} />
          <div className="relative w-full rounded-t-[2.5rem] bg-background/95 backdrop-blur-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.8)] border-t border-white/10 overscroll-contain animate-in slide-in-from-bottom-full duration-300">
            <div className="p-6 pb-12 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mb-2" />
              <div className="flex items-center justify-between mb-2">
                <p className="font-extrabold text-lg">თქვენი შეკვეთა</p>
                <div className="nm-inset px-4 py-1.5 rounded-full">
                  <p className="font-mono text-xl font-black text-primary">{gel(cartTotal)}</p>
                </div>
              </div>

              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-1">
                    <p className="text-sm font-bold flex-1 truncate pr-2 leading-tight">{item.name}</p>
                    <div className="flex items-center gap-4 shrink-0 bg-white/5 px-2 py-1.5 rounded-2xl">
                      <button onClick={() => updateQty(item.id, -1)} className="size-8 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
                        <Minus className="size-4" />
                      </button>
                      <span className="font-mono font-bold w-4 text-center text-sm">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="size-8 rounded-xl flex items-center justify-center text-primary hover:bg-primary/20 transition-colors">
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleOrder}
                disabled={busy}
                className="nm-daylight w-full mt-4 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-primary transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {busy ? <span className="animate-pulse">იგზავნება...</span> : <><Send className="size-5" /> შეკვეთის გაგზავნა</>}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Success Modal */}
      {successType && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="nm-raised flex flex-col items-center justify-center p-8 rounded-3xl m-6 text-center animate-in zoom-in-95">
            {successType === 'order' && (
              <>
                <CheckCircle2 className="size-16 text-green-500 mb-4" />
                <h2 className="text-xl font-black mb-2">შეკვეთა მიღებულია!</h2>
                <p className="text-sm text-muted-foreground">ოპერატორი მალე მოგართმევთ შეკვეთას ადგილზე.</p>
              </>
            )}
            {successType === 'battery' && (
              <>
                <BatteryWarning className="size-16 text-red-500 mb-4" />
                <h2 className="text-xl font-black mb-2">მოთხოვნა გაიგზავნა!</h2>
                <p className="text-sm text-muted-foreground">ოპერატორმა მიიღო შეტყობინება და მალე გამოგიცვლით ჯოისტიკს.</p>
              </>
            )}
            {successType === 'equipment' && (
              <>
                <Boxes className="size-16 text-[var(--status-warning5)] mb-4" />
                <h2 className="text-xl font-black mb-2">მოთხოვნა გაიგზავნა!</h2>
                <p className="text-sm text-muted-foreground">ოპერატორმა მიიღო შეტყობინება და მალე მოგიტანთ ინვენტარს (ცარცი/ბურთები/კიი).</p>
              </>
            )}
            {successType === 'call' && (
              <>
                <Bell className="size-16 text-[var(--status-free)] mb-4" />
                <h2 className="text-xl font-black mb-2">ოპერატორი გამოძახებულია!</h2>
                <p className="text-sm text-muted-foreground">ოპერატორმა უკვე მიიღო შეტყობინება და მალე მოვა თქვენთან.</p>
              </>
            )}
            {successType === 'extend' && (
              <>
                <Clock className="size-16 text-[var(--status-active)] mb-4" />
                <h2 className="text-xl font-black mb-2">მოთხოვნა გაიგზავნა!</h2>
                <p className="text-sm text-muted-foreground">ოპერატორი დაადასტურებს და დრო დაგემატებათ — ანგარიშშიც აისახება.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">იტვირთება...</div>}>
      <PortalApp />
    </Suspense>
  )
}
