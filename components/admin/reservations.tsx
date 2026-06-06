'use client'

import { useState, useEffect } from 'react'
import { CalendarClock, LoaderCircle, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import type { Reservation, ReservationStatus } from '@/lib/types'

type ResWithConsole = Reservation & { consoles: { name: string } | null }

const STATUS_STYLES: Record<ReservationStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
  completed: 'bg-blue-500/20 text-blue-400',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'მოლოდინში',
  confirmed: 'დადასტურებული',
  cancelled: 'გაუქმებული',
  completed: 'დასრულებული',
}

const STATUS_ORDER: Record<ReservationStatus, number> = {
  pending: 1,
  confirmed: 2,
  completed: 3,
  cancelled: 4,
}

const MONTHS = ['იანვ', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ']
function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mmm = MONTHS[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${dd} ${mmm}, ${hh}:${mm}`
}

function getLocalIsoString() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export function Reservations() {
  const { currentVenueId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const isManager = ['owner', 'admin', 'manager'].includes(currentRole ?? '')

  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [reservations, setReservations] = useState<ResWithConsole[]>([])
  const [consoles, setConsoles] = useState<{ id: number; name: string }[]>([])

  // Form states
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [startTime, setStartTime] = useState(getLocalIsoString())
  const [durationMin, setDurationMin] = useState(60)
  const [consoleId, setConsoleId] = useState('')
  const [notes, setNotes] = useState('')

  const loadData = async () => {
    if (!currentVenueId) return
    setLoading(true)
    const [resRes, conRes] = await Promise.all([
      supabase
        .from('reservations')
        .select('*, consoles(name)')
        .eq('venue_id', currentVenueId)
        .order('start_time', { ascending: true }),
      supabase
        .from('consoles')
        .select('id, name')
        .eq('venue_id', currentVenueId)
        .eq('status', 'free'),
    ])

    if (resRes.data) {
      const sorted = (resRes.data as unknown as ResWithConsole[]).sort((a, b) => {
        if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        }
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      })
      setReservations(sorted)
    }
    if (conRes.data) {
      setConsoles(conRes.data as { id: number; name: string }[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVenueId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentVenueId || !isManager) return
    setAdding(true)

    const dateObj = new Date(startTime)

    const { data: newId, error } = await supabase.rpc('create_reservation', {
      p_venue_id: currentVenueId,
      p_customer_name: customerName.trim(),
      p_start_time: dateObj.toISOString(),
      p_duration_min: durationMin,
      p_console_id: consoleId ? Number(consoleId) : undefined,
      p_customer_phone: customerPhone.trim() || undefined,
      p_notes: notes.trim() || undefined,
    })

    setAdding(false)
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pushToast('danger', (error as any).error_description || error.message || 'შეცდომა')
      return
    }

    pushToast('success', 'ჯავშანი დამატებულია')
    setCustomerName('')
    setCustomerPhone('')
    setStartTime(getLocalIsoString())
    setDurationMin(60)
    setConsoleId('')
    setNotes('')
    loadData()
  }

  const handleConfirm = async (id: string) => {
    if (!isManager) return
    const { error } = await supabase.rpc('confirm_reservation', { p_reservation_id: id })
    if (error) pushToast('danger', error.message)
    else loadData()
  }

  const handleCancel = async (id: string) => {
    if (!isManager) return
    const { error } = await supabase.rpc('cancel_reservation', { p_reservation_id: id })
    if (error) pushToast('danger', error.message)
    else loadData()
  }

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <LoaderCircle className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 items-start">
      {/* Left: Form */}
      {isManager && (
        <div className="nm-raised rounded-3xl p-6">
          <div className="mb-6 flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            <h2 className="text-xl font-extrabold tracking-tight">ახალი ჯავშანი</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-muted-foreground">მომხმარებელი *</span>
                <input
                  type="text"
                  required
                  placeholder="სახელი და გვარი"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none placeholder:text-muted-foreground/50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">ტელეფონი</span>
                <input
                  type="text"
                  placeholder="+995 5XX XXX XXX"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none placeholder:text-muted-foreground/50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">თარიღი და დრო *</span>
                <input
                  type="datetime-local"
                  required
                  min={getLocalIsoString()}
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none text-primary"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">ხანგრძლივობა (წუთი) *</span>
                <input
                  type="number"
                  required
                  min={30}
                  step={30}
                  value={durationMin}
                  onChange={e => setDurationMin(Number(e.target.value))}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">კონსოლი</span>
                <select
                  value={consoleId}
                  onChange={e => setConsoleId(e.target.value)}
                  className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none appearance-none bg-transparent"
                >
                  <option value="" className="bg-background">კონსოლი არ არის მითითებული</option>
                  {consoles.map(c => (
                    <option key={c.id} value={c.id} className="bg-background">{c.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">შენიშვნა</span>
              <textarea
                rows={2}
                placeholder="შენიშვნა..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="nm-inset mt-1.5 w-full resize-none rounded-2xl px-4 py-3 text-sm font-bold outline-none placeholder:text-muted-foreground/50"
              />
            </label>

            <button
              type="submit"
              disabled={adding}
              className="nm-daylight flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-bold text-primary"
            >
              შენახვა
            </button>
          </form>
        </div>
      )}

      {/* Right: List */}
      <div className={cn("nm-raised rounded-3xl p-6", !isManager && "md:col-span-2")}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-tight">ჯავშნები</h2>
          <span className="nm-inset flex items-center justify-center rounded-xl px-3 py-1 text-xs font-bold text-muted-foreground">
            {reservations.length}
          </span>
        </div>

        {reservations.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm font-bold text-muted-foreground">
            ჯავშნები არ არის
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map(r => (
              <div key={r.id} className="nm-raised-sm rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-bold leading-tight flex-1 line-clamp-2">{r.customer_name}</p>
                  <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0", STATUS_STYLES[r.status])}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>
                
                <p className="text-sm font-semibold text-primary mb-1">
                  {formatDateTime(r.start_time)} <span className="text-muted-foreground px-1">•</span> {r.duration_min} წთ
                </p>
                <p className="text-xs text-muted-foreground mb-1">
                  {r.consoles?.name || "კონსოლი არ არის მითითებული"}
                </p>
                {r.customer_phone && (
                  <p className="text-xs text-muted-foreground mb-1">📞 {r.customer_phone}</p>
                )}
                {r.notes && (
                  <p className="text-[11px] text-muted-foreground bg-black/10 rounded-xl px-2 py-1.5 mt-2 break-words">
                    {r.notes}
                  </p>
                )}

                {/* Actions */}
                {isManager && (r.status === 'pending' || r.status === 'confirmed') && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {r.status === 'pending' && (
                      <button
                        onClick={() => handleConfirm(r.id)}
                        className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-green-500"
                      >
                        <CheckCircle2 className="size-3.5" />
                        დადასტურება
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(r.id)}
                      className="nm-btn flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-red-500"
                    >
                      <XCircle className="size-3.5" />
                      გაუქმება
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
