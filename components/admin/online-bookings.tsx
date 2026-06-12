'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Globe,
  Phone,
  Calendar,
  Clock,
  Check,
  X,
  CircleCheck,
  CircleSlash,
  CreditCard,
  Gamepad2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'

interface Booking {
  id: string
  venue_id: string
  console_id: number | null
  customer_name: string
  customer_phone: string
  start_time: string
  duration_min: number
  controllers: number
  status: string
  payment_method: string
  payment_status: string
  total_amount: number
  commission_amount: number
  notes: string | null
  created_at: string
  venues?: { name: string } | null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'მოლოდინში', color: 'var(--status-warning10)' },
  confirmed: { label: 'დადასტურებული', color: 'var(--status-free)' },
  completed: { label: 'დასრულებული', color: 'var(--muted-foreground)' },
  cancelled: { label: 'გაუქმებული', color: 'var(--status-expired)' },
  no_show: { label: 'არ მოვიდა', color: 'var(--status-expired)' },
}

const PAY_METHOD: Record<string, string> = {
  transfer: 'გადარიცხვა',
  card: 'ბარათი',
  cash_on_arrival: 'ადგილზე',
}

type Filter = 'pending' | 'confirmed' | 'all'

export function OnlineBookings() {
  const { currentOrgId } = useOrg()
  const { pushToast } = usePlayroom()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    if (!currentOrgId) return
    const { data } = await supabase
      .from('marketplace_bookings')
      .select('*, venues(name)')
      .eq('org_id', currentOrgId)
      .order('start_time', { ascending: true })
    if (data) setBookings(data as unknown as Booking[])
  }, [currentOrgId])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const patch = async (id: string, patch: Record<string, unknown>, msg: string) => {
    setBusyId(id)
    const { error } = await (supabase.from('marketplace_bookings') as any).update(patch).eq('id', id)
    setBusyId(null)
    if (error) return pushToast('danger', error.message)
    pushToast('success', msg)
    fetchBookings()
  }

  const confirm = (id: string) => patch(id, { status: 'confirmed' }, 'ჯავშანი დადასტურდა')
  const cancel = (id: string) => patch(id, { status: 'cancelled' }, 'ჯავშანი გაუქმდა')
  const complete = (id: string) => patch(id, { status: 'completed' }, 'ჯავშანი დასრულდა')
  const noShow = (id: string) => patch(id, { status: 'no_show' }, 'მონიშნულია — არ მოვიდა')
  const markPaid = (id: string) =>
    patch(id, { payment_status: 'paid', paid_at: new Date().toISOString() }, 'გადახდა დაფიქსირდა')

  const pendingCount = bookings.filter((b) => b.status === 'pending').length

  const shown = bookings.filter((b) =>
    filter === 'all' ? true : filter === 'pending' ? b.status === 'pending' : b.status === 'confirmed',
  )

  const fmt = (ts: string) => {
    const d = new Date(ts)
    return {
      date: d.toLocaleDateString('ka-GE', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' }),
    }
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'pending', label: `მოლოდინში${pendingCount ? ` (${pendingCount})` : ''}` },
    { key: 'confirmed', label: 'დადასტურებული' },
    { key: 'all', label: 'ყველა' },
  ]

  return (
    <div className="space-y-6">
      <section className="nm-raised rounded-3xl p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
              <Globe className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">ონლაინ ჯავშნები</h2>
              <p className="text-xs text-muted-foreground">
                martelounge.ge-დან შემოსული ჯავშნები
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-xl px-3.5 py-2 text-sm font-bold transition',
                  filter === f.key ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {filter === 'pending'
              ? 'ახალი ჯავშანი არ არის 🎉'
              : 'ჯავშანი ვერ მოიძებნა'}
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((b) => {
              const meta = STATUS_META[b.status] ?? { label: b.status, color: 'var(--muted-foreground)' }
              const { date, time } = fmt(b.start_time)
              const isBusy = busyId === b.id
              const terminal = ['completed', 'cancelled', 'no_show'].includes(b.status)
              const paid = b.payment_status === 'paid'
              return (
                <div key={b.id} className="nm-raised-sm rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Left: customer + when */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{b.customer_name}</span>
                        <a
                          href={`tel:${b.customer_phone}`}
                          className="flex items-center gap-1 text-xs text-primary"
                        >
                          <Phone className="size-3" />
                          {b.customer_phone}
                        </a>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="size-3.5" /> {date}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="size-3.5" /> {time} · {b.duration_min} წთ
                        </span>
                        {b.venues?.name && <span>{b.venues.name}</span>}
                        {b.console_id && (
                          <span className="flex items-center gap-1.5">
                            <Gamepad2 className="size-3.5" /> #{b.console_id}
                          </span>
                        )}
                      </div>
                      {b.notes && (
                        <p className="mt-1 text-xs text-muted-foreground italic">„{b.notes}"</p>
                      )}
                    </div>

                    {/* Right: status + money */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-primary">{gel(b.total_amount)}</div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: paid ? 'var(--status-free)' : 'var(--muted-foreground)' }}
                      >
                        {PAY_METHOD[b.payment_method] ?? b.payment_method} ·{' '}
                        {paid ? 'გადახდილი' : 'გადაუხდელი'}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {!terminal && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                      {b.status === 'pending' && (
                        <button
                          disabled={isBusy}
                          onClick={() => confirm(b.id)}
                          className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-free)]"
                        >
                          <Check className="size-3.5" /> დადასტურება
                        </button>
                      )}
                      {!paid && (
                        <button
                          disabled={isBusy}
                          onClick={() => markPaid(b.id)}
                          className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-primary"
                        >
                          <CreditCard className="size-3.5" /> გადახდილია
                        </button>
                      )}
                      {b.status === 'confirmed' && (
                        <button
                          disabled={isBusy}
                          onClick={() => complete(b.id)}
                          className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground"
                        >
                          <CircleCheck className="size-3.5" /> დასრულდა
                        </button>
                      )}
                      <button
                        disabled={isBusy}
                        onClick={() => noShow(b.id)}
                        className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground"
                      >
                        <CircleSlash className="size-3.5" /> არ მოვიდა
                      </button>
                      <button
                        disabled={isBusy}
                        onClick={() => cancel(b.id)}
                        className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-expired)]"
                      >
                        <X className="size-3.5" /> გაუქმება
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
