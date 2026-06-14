'use client'

import { useMemo, useState } from 'react'
import { Clock3, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'
import { gel, paymentMethodLabel, timeOfDay } from '@/lib/ui'
import { FraudAuditDashboard } from './fraud-audit'

type Filter = 'all' | 'standard' | 'premium' | 'audit'

export function HistoryModule() {
  const { completed, employees, pushToast } = usePlayroom()
  // map a session's created_by_user (auth uid) → operator name via the linked employee
  const opName = useMemo(
    () => new Map(employees.filter((e) => e.user_id).map((e) => [e.user_id as string, e.name])),
    [employees],
  )
  const { currentRole } = useOrg()
  const canVoidRefund = ['owner', 'admin', 'manager'].includes(currentRole ?? '')

  const [filter, setFilter] = useState<Filter>('all')
  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)

  const handleRefund = async () => {
    if (!selectedSessionId) return
    setIsRefunding(true)
    const { error } = await supabase.rpc('refund_session', {
      p_session_id: selectedSessionId,
      p_reason: refundReason.trim() || undefined,
      p_refund_amount: refundAmount ? parseFloat(refundAmount) : undefined,
    })
    setIsRefunding(false)

    if (error) {
      if (error.message.includes('already_refunded')) pushToast('danger', 'ეს სესია უკვე დაბრუნებულია')
      else if (error.message.includes('session_not_completed')) pushToast('danger', 'მხოლოდ დასრულებული სესიები შეიძლება დაბრუნდეს')
      else if (error.message.includes('insufficient_privilege')) pushToast('danger', 'ამ ოპერაციის უფლება არ გაქვთ')
      else pushToast('danger', 'შეცდომა. სცადეთ თავიდან.')
    } else {
      pushToast('success', 'სესია დაბრუნებულია')
      setRefundModalOpen(false)
    }
  }

  const openRefundModal = (id: string) => {
    setSelectedSessionId(id)
    setRefundReason('')
    setRefundAmount('')
    setRefundModalOpen(true)
  }

  const rows = useMemo(() => {
    if (filter === 'all' || filter === 'audit') return completed
    const name = filter === 'standard' ? 'სტანდარტი' : 'პრემიუმი'
    return completed.filter((c) => c.plan_name === name)
  }, [completed, filter])

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ყველა' },
    { key: 'standard', label: 'სტანდარტი' },
    { key: 'premium', label: 'პრემიუმი' },
    { key: 'audit', label: '🕵️ AI აუდიტი' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm font-bold whitespace-nowrap',
              filter === t.key ? 'nm-daylight text-primary' : 'nm-btn',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filter === 'audit' ? (
        <FraudAuditDashboard />
      ) : (
        <>
          <div className="nm-raised overflow-hidden rounded-3xl">
            {/* header */}
            <div className="hidden grid-cols-12 gap-3 border-b border-border px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span className="col-span-3">მომხმარებელი</span>
              <span className="col-span-2">კონსოლი</span>
              <span className="col-span-2">ტარიფი</span>
              <span className="col-span-2">ხანგრძლივობა</span>
              <span className="col-span-1">დასრულდა</span>
              <span className="col-span-2 text-right">თანხა</span>
            </div>

            <ul>
              {rows.map((s) => {
                const extra = s.extensions.reduce((a, e) => a + e.extra_minutes, 0)
                const isRefunded = !!(s as any).refunded_at
                return (
                  <li
                    key={s.id}
                    className="grid grid-cols-2 gap-3 border-b border-border px-6 py-4 last:border-b-0 md:grid-cols-12 md:items-center"
                  >
                    <div className="md:col-span-3">
                      <p className="font-bold">{s.customer_name ?? 'სტუმარი'}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {paymentMethodLabel[s.payment_method]}
                        {s.bank ? ` • ${s.bank}` : ''}
                        {s.created_by_user && opName.get(s.created_by_user) ? ` • 👤 ${opName.get(s.created_by_user)}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {s.console_name} • {s.plan_name}
                      </p>
                    </div>
                    <span className="hidden text-sm md:col-span-2 md:block">
                      {s.console_name}
                    </span>
                    <span className="hidden text-sm md:col-span-2 md:block">
                      {s.plan_name}
                    </span>
                    <span className="hidden items-center gap-1 text-sm md:col-span-2 md:flex">
                      <Clock3 className="size-3.5 text-muted-foreground" />
                      {s.duration_min ?? 0} წთ
                      {extra > 0 ? (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[color-mix(in_oklch,var(--primary)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          <Plus className="size-2.5" />
                          {extra}
                        </span>
                      ) : null}
                    </span>
                    <span className="hidden font-mono text-sm text-muted-foreground md:col-span-1 md:block">
                      {timeOfDay(s.ended_at ?? s.ends_at ?? s.started_at)}
                    </span>
                    <span className="text-right font-mono text-sm font-extrabold text-primary md:col-span-2 flex flex-col items-end gap-2">
                      <span className={cn(isRefunded && 'line-through text-muted-foreground')}>
                        {gel(s.price_total)}
                      </span>
                      {isRefunded ? (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="nm-inset px-2 py-0.5 rounded-lg text-xs text-muted-foreground">დაბრუნებული</span>
                          <span className="text-xs font-bold text-muted-foreground">{gel((s as any).refund_amount)}</span>
                        </div>
                      ) : canVoidRefund ? (
                        <button
                          onClick={() => openRefundModal(s.id)}
                          className="nm-btn rounded-xl px-2 py-1 text-xs text-amber-400 font-bold"
                        >
                          დაბრუნება
                        </button>
                      ) : null}
                    </span>
                  </li>
                )
              })}
              {rows.length === 0 ? (
                <li className="py-12 text-center text-sm text-muted-foreground">
                  ჩანაწერი ვერ მოიძებნა
                </li>
              ) : null}
            </ul>
          </div>

          <Modal open={refundModalOpen} onClose={() => setRefundModalOpen(false)} title="სესიის დაბრუნება">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-muted-foreground">თანხა ₾ (არასრული დაბრუნება)</span>
                <input
                  type="number"
                  step="0.01"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder={(rows.find(r => r.id === selectedSessionId)?.price_total || 0).toString()}
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm font-mono font-bold outline-none text-primary"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-muted-foreground">მიზეზი</span>
                <input
                  type="text"
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none text-primary"
                />
              </label>
              <button
                onClick={handleRefund}
                disabled={isRefunding}
                className="nm-btn flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-bold text-amber-400"
              >
                დაბრუნება
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
