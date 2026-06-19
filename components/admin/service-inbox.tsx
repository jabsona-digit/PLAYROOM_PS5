'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BatteryWarning, ShoppingBag, X, Check, Ban, ConciergeBell, Boxes } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { cn } from '@/lib/utils'

// service_requests + resolve_service_request ship in migration 0057; DB types
// regenerate on deploy, so go through loose wrappers until then.
const sb = supabase as any

interface ReqItem { product_id: number; name: string; unit_price: number; qty: number; line_total: number }
interface ServiceRequest {
  id: string
  console_id: number
  kind: 'order' | 'battery' | 'call' | 'equipment' | 'extend'
  items: ReqItem[]
  total: number
  created_at: string
}

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 760
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    o.start(); o.stop(ctx.currentTime + 0.41)
    o.onended = () => ctx.close()
  } catch { /* autoplay blocked */ }
}

function minutesAgo(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'ახლახ'
  if (m < 60) return `${m} წთ წინ`
  return `${Math.floor(m / 60)} სთ წინ`
}

const KIND = {
  order: { label: 'შეკვეთა', Icon: ShoppingBag, color: 'var(--primary)' },
  battery: { label: 'ჯოისტიკი დაჯდა', Icon: BatteryWarning, color: 'var(--status-expired)' },
  call: { label: 'სტაფის გამოძახება', Icon: ConciergeBell, color: 'var(--status-free)' },
  equipment: { label: 'ინვენტარი (ბილიარდი)', Icon: Boxes, color: 'var(--status-warning5)' },
  extend: { label: 'დროის გაგრძელება', Icon: Bell, color: 'var(--status-active)' },
} as const

export function ServiceInbox() {
  const { currentVenueId, currentRole } = useOrg()
  const { consoles, settings, pushToast } = usePlayroom()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [open, setOpen] = useState(false)
  const [payFor, setPayFor] = useState<string | null>(null) // request id awaiting a payment choice
  const [busyId, setBusyId] = useState<string | null>(null)

  const soundRef = useRef(true)
  soundRef.current = settings?.sound_alerts ?? true

  // Only floor-facing roles get the live inbox.
  const enabled = !!currentVenueId && ['owner', 'admin', 'manager', 'operator', 'cashier'].includes(currentRole ?? '')

  const consoleName = useCallback(
    (id: number) => consoles.find((c) => Number(c.id) === id)?.name ?? `#${id}`,
    [consoles],
  )

  const refresh = useCallback(async () => {
    if (!currentVenueId) return
    const { data, error } = await sb
      .from('service_requests')
      .select('id, console_id, kind, items, total, created_at')
      .eq('venue_id', currentVenueId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    // keep the current list on a transient auth blip (expired token mid-poll) —
    // supabase-js auto-refreshes and the next poll recovers; don't flash empty.
    if (error) return
    setRequests((data as ServiceRequest[]) ?? [])
  }, [currentVenueId])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const iv = setInterval(refresh, 30_000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)

    const channel = supabase
      .channel(`svc-req-${currentVenueId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'service_requests', filter: `venue_id=eq.${currentVenueId}` },
        (payload) => {
          const r = payload.new as { kind?: keyof typeof KIND; console_id?: number }
          const label = r.kind ? KIND[r.kind].label : 'ახალი მოთხოვნა'
          pushToast('info', `🔔 ${label} — ${consoleName(r.console_id ?? 0)}`)
          if (soundRef.current) beep()
          setOpen(true)
          refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'service_requests', filter: `venue_id=eq.${currentVenueId}` },
        () => refresh(),
      )
      .subscribe()

    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [enabled, currentVenueId, refresh, pushToast, consoleName])

  if (!enabled) return null

  const count = requests.length

  const resolve = async (id: string, status: 'done' | 'dismissed', method?: string, bank?: string | null, onTab = false) => {
    setBusyId(id)
    const { data, error } = await sb.rpc('resolve_service_request', {
      p_id: id,
      p_status: status,
      p_payment_method: method ?? null,
      p_bank: bank ?? null,
      p_on_tab: onTab,
    })
    setBusyId(null)
    setPayFor(null)
    if (error || data?.error) {
      const code = String(data?.error ?? error?.message ?? '')
      if (code.includes('insufficient_stock')) {
        pushToast('danger', `მარაგი არ არის საკმარისი${data?.product ? ` — ${data.product} (დარჩა ${data.available})` : ''}. შეავსე საწყობი.`)
      } else {
        pushToast('danger', 'ვერ შესრულდა. სცადეთ თავიდან.')
      }
      return
    }
    if (status === 'done' && onTab) pushToast('success', '🧾 დაემატა ტაბზე — გადახდა სესიის ბოლოს')
    else if (status === 'done' && method) pushToast('success', 'შეკვეთა გაიყიდა ✅')
    refresh()
  }

  return (
    <>
      {/* Floating launcher (bottom-left, clears the AI assistant on the right) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="In-Seat მოთხოვნები"
        className="fixed bottom-5 left-5 z-[90] flex size-14 items-center justify-center rounded-2xl nm-raised"
      >
        <Bell className={cn('size-6', count > 0 ? 'text-primary' : 'text-muted-foreground')} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[20px] animate-pulse items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-[var(--primary-foreground)] shadow-[0_0_12px_var(--primary)]">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 left-5 z-[90] w-[min(92vw,380px)] animate-in fade-in slide-in-from-bottom-4">
          <div className="nm-raised flex max-h-[70vh] flex-col overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-black">
                <ConciergeBell className="size-4 text-primary" />
                In-Seat მოთხოვნები {count > 0 ? `(${count})` : ''}
              </p>
              <button onClick={() => setOpen(false)} className="nm-btn flex size-8 items-center justify-center rounded-xl">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {count === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  ახალი მოთხოვნა არ არის 🎮
                </div>
              ) : (
                requests.map((r) => {
                  const meta = KIND[r.kind]
                  return (
                    <div key={r.id} className="nm-inset rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold">
                          <meta.Icon className="size-4" style={{ color: meta.color }} />
                          <span className="text-sm">{consoleName(r.console_id)}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-muted-foreground">{minutesAgo(r.created_at)}</span>
                      </div>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                        {meta.label}
                      </p>
                      {r.kind === 'extend' && (() => {
                        const it = (r.items?.[0] as { minutes?: number; pay?: string }) ?? {}
                        const payLabel = it.pay === 'cash' ? '💵 ნაღდი ახლა'
                          : it.pay === 'card' ? '💳 ბარათი ახლა'
                          : it.pay === 'transfer' ? '🏦 გადარიცხვა ახლა'
                          : '🧾 ბოლოს (ტაბზე)'
                        return (
                          <p className="mt-1 text-sm font-black text-primary">
                            +{it.minutes ?? '?'} წთ · {payLabel} — დაადასტურე
                          </p>
                        )
                      })()}

                      {r.kind === 'order' && (
                        <ul className="mt-2 space-y-1">
                          {(r.items ?? []).map((it, i) => (
                            <li key={i} className="flex justify-between text-xs text-muted-foreground">
                              <span>{it.qty}× {it.name}</span>
                              <span className="font-mono">{gel(it.line_total)}</span>
                            </li>
                          ))}
                          <li className="flex justify-between border-t border-border pt-1 text-sm font-black text-primary">
                            <span>ჯამი</span>
                            <span className="font-mono">{gel(r.total)}</span>
                          </li>
                        </ul>
                      )}

                      {/* actions */}
                      {r.kind === 'order' ? (
                        payFor === r.id ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ახლა გადახდა:</p>
                            <div className="grid grid-cols-3 gap-2">
                              <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'done', 'cash')} className="nm-btn rounded-xl py-2 text-xs font-bold text-[var(--status-free)]">ნაღდი</button>
                              <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'done', 'card', 'TBC')} className="nm-btn rounded-xl py-2 text-xs font-bold text-primary">TBC</button>
                              <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'done', 'card', 'BOG')} className="nm-btn rounded-xl py-2 text-xs font-bold text-primary">BOG</button>
                            </div>
                            <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'done', undefined, undefined, true)} className="nm-btn w-full rounded-xl py-2 text-xs font-bold text-[var(--status-warning5)]">🧾 ტაბზე — გადახდა სესიის ბოლოს</button>
                          </div>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <button disabled={busyId === r.id} onClick={() => setPayFor(r.id)} className="nm-daylight flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-primary">
                              <Check className="size-4" /> მიწოდდა & გაყიდვა
                            </button>
                            <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'dismissed')} className="nm-btn flex size-10 items-center justify-center rounded-xl text-muted-foreground" title="უარყოფა">
                              <Ban className="size-4" />
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'done')} className="nm-daylight flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-[var(--status-free)]">
                            <Check className="size-4" /> შესრულდა
                          </button>
                          <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'dismissed')} className="nm-btn flex size-10 items-center justify-center rounded-xl text-muted-foreground" title="უარყოფა">
                            <Ban className="size-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
