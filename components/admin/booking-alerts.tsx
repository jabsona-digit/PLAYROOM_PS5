'use client'

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'

const Ctx = createContext<{ pendingCount: number; refresh: () => void; markSeen: () => void }>({
  pendingCount: 0,
  refresh: () => {},
  markSeen: () => {},
})

export const useBookingAlerts = () => useContext(Ctx)

// Short chime via Web Audio (no asset needed).
function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    o.start()
    o.stop(ctx.currentTime + 0.36)
    o.onended = () => ctx.close()
  } catch {
    /* autoplay blocked — ignore */
  }
}

// Last time the operator LOOKED at the online-bookings module (per org, this
// device). Bookings created after this moment count as "unseen" for the bell.
const seenKey = (orgId: string) => `playroom:bookings-seen:${orgId}`
function getLastSeen(orgId: string): string {
  try {
    const v = localStorage.getItem(seenKey(orgId))
    if (v) return v
    // first run: don't backfill history into the badge — start counting from now
    const now = new Date().toISOString()
    localStorage.setItem(seenKey(orgId), now)
    return now
  } catch {
    return new Date().toISOString()
  }
}

/**
 * Live "new online booking" awareness, available app-wide (drives the topbar
 * bell badge regardless of the active module). Realtime gives an instant toast;
 * a 60s poll + window-focus refetch keeps the count accurate if an event is missed.
 *
 * The badge counts bookings that NEED ATTENTION: still-pending ones (action
 * required) PLUS anything that arrived since the operator last opened the
 * online-bookings module — so a card-paid booking that auto-confirms within a
 * second (bank-pay 0146) no longer vanishes before anyone sees it. Opening the
 * module calls markSeen() and clears the "arrived" part; pendings remain.
 */
export function BookingAlertsProvider({ children }: { children: React.ReactNode }) {
  const { currentOrgId } = useOrg()
  const { pushToast, settings } = usePlayroom()
  const [pendingCount, setPendingCount] = useState(0)

  const soundRef = useRef(true)
  soundRef.current = settings?.sound_alerts ?? true
  // paid-toast de-dupe: reminder/other UPDATEs on an already-paid booking must
  // not re-announce it (session-scoped; realtime never replays old events)
  const paidToastedRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!currentOrgId) return
    const lastSeen = getLastSeen(currentOrgId)
    const { count } = await supabase
      .from('marketplace_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', currentOrgId)
      .or(`status.eq.pending,created_at.gt.${lastSeen}`)
    setPendingCount(count ?? 0)
  }, [currentOrgId])

  const markSeen = useCallback(() => {
    if (!currentOrgId) return
    try { localStorage.setItem(seenKey(currentOrgId), new Date().toISOString()) } catch { /* ignore */ }
    refresh()
  }, [currentOrgId, refresh])

  useEffect(() => {
    if (!currentOrgId) return
    refresh()

    const iv = setInterval(refresh, 60_000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)

    const channel = supabase
      .channel(`mb-alerts-${currentOrgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'marketplace_bookings', filter: `org_id=eq.${currentOrgId}` },
        (payload) => {
          const name = (payload.new as { customer_name?: string })?.customer_name ?? 'ახალი კლიენტი'
          pushToast('info', `🔔 ახალი ონლაინ ჯავშანი — ${name}`)
          if (soundRef.current) beep()
          refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'marketplace_bookings', filter: `org_id=eq.${currentOrgId}` },
        (payload) => {
          // announce the money moment once: unpaid → paid (online card via bank-pay).
          // paid_at freshness guards against unrelated UPDATEs on long-paid bookings
          // (reminder stamps, check-in) re-announcing them after a page reload.
          const row = payload.new as { id?: string; payment_status?: string; customer_name?: string; paid_at?: string | null }
          const paidRecently = !!row?.paid_at && Date.now() - new Date(row.paid_at).getTime() < 120_000
          if (row?.id && row.payment_status === 'paid' && paidRecently && !paidToastedRef.current.has(row.id)) {
            paidToastedRef.current.add(row.id)
            pushToast('success', `💳 ჯავშანი გადახდილია — ${row.customer_name ?? 'კლიენტი'}`)
            if (soundRef.current) beep()
          }
          refresh()
        },
      )
      .subscribe()

    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [currentOrgId, refresh, pushToast])

  return <Ctx.Provider value={{ pendingCount, refresh, markSeen }}>{children}</Ctx.Provider>
}
