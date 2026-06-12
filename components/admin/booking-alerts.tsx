'use client'

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'

const Ctx = createContext<{ pendingCount: number; refresh: () => void }>({
  pendingCount: 0,
  refresh: () => {},
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

/**
 * Live "new online booking" awareness, available app-wide (drives the topbar
 * bell badge regardless of the active module). Realtime gives an instant toast;
 * a 60s poll + window-focus refetch keeps the count accurate if an event is missed.
 */
export function BookingAlertsProvider({ children }: { children: React.ReactNode }) {
  const { currentOrgId } = useOrg()
  const { pushToast, settings } = usePlayroom()
  const [pendingCount, setPendingCount] = useState(0)

  const soundRef = useRef(true)
  soundRef.current = settings?.sound_alerts ?? true

  const refresh = useCallback(async () => {
    if (!currentOrgId) return
    const { count } = await supabase
      .from('marketplace_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', currentOrgId)
      .eq('status', 'pending')
    setPendingCount(count ?? 0)
  }, [currentOrgId])

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
        () => refresh(),
      )
      .subscribe()

    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      supabase.removeChannel(channel)
    }
  }, [currentOrgId, refresh, pushToast])

  return <Ctx.Provider value={{ pendingCount, refresh }}>{children}</Ctx.Provider>
}
