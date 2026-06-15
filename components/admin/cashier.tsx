'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  CalendarRange,
  Coins,
  CreditCard,
  Gamepad2,
  Infinity as InfinityIcon,
  Landmark,
  Receipt,
  PlayCircle,
  StopCircle,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Coffee,
} from 'lucide-react'
import { Modal } from './modal'
import { usePlayroom } from '@/lib/store'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import {
  gel,
  paymentMethodLabel,
  startOfMonth,
  startOfToday,
  startOfWeek,
  timeOfDay,
} from '@/lib/ui'
import type { PaymentMethod } from '@/lib/types'

interface BarSaleRow {
  id: string
  total: number
  payment_method: string
  bank: string | null
  created_at: string
  voided_at: string | null
  tip_amount: number
  bar_sale_items: { qty: number; unit_cost_price: number }[]
}

const METHOD_ICON: Record<PaymentMethod, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowLeftRight,
}

export function Cashier() {
  const { completed, consoles, pushToast } = usePlayroom()
  const { currentVenueId } = useOrg()
  const [barSales, setBarSales] = useState<BarSaleRow[]>([])

  const [shiftOpen, setShiftOpen] = useState(false)
  const [shiftModalMode, setShiftModalMode] = useState<'open' | 'close'>('open')
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [zReportVisible, setZReportVisible] = useState(false)

  // Shared, DB-backed cash drawer for this venue — ONE open at a time, visible to
  // every operator (migration 0054). Replaces the old per-device local shift state,
  // so two cashiers can't each open a drawer and double-count the same venue cash.
  const [drawer, setDrawer] = useState<{
    id: string; opened_at: string; opening_cash: number; opened_by: string; expected_cash: number
  } | null>(null)

  const loadDrawer = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await supabase.rpc('get_open_drawer', { p_venue_id: currentVenueId })
    const r = data as {
      open?: boolean; id?: string; opened_at?: string; opening_cash?: number; opened_by?: string; expected_cash?: number
    } | null
    setDrawer(
      r?.open && r.id && r.opened_at
        ? {
            id: r.id,
            opened_at: r.opened_at,
            opening_cash: Number(r.opening_cash) || 0,
            opened_by: r.opened_by ?? '',
            expected_cash: Number(r.expected_cash) || 0,
          }
        : null,
    )
  }, [currentVenueId])

  useEffect(() => {
    loadDrawer()
  }, [loadDrawer])

  // Derived shift view from the shared drawer (DB is the source of truth).
  const currentShiftStart = drawer ? new Date(drawer.opened_at) : null
  const openingCashAmount = drawer?.opening_cash ?? 0
  const expectedCash = drawer?.expected_cash ?? 0 // opening float + cash collected since open

  useEffect(() => {
    if (!currentVenueId) return
    const fetchBarSales = async () => {
      const { data } = await supabase
        .from('bar_sales')
        .select(`
          id, total, tip_amount, payment_method, bank, created_at, voided_at,
          bar_sale_items(qty, unit_cost_price)
        `)
        .eq('venue_id', currentVenueId)
        .is('voided_at', null)
      if (data) {
        setBarSales(data)
      }
    }
    fetchBarSales()
  }, [currentVenueId])

  const data = useMemo(() => {
    const t0 = startOfToday()
    const w0 = startOfWeek()
    const m0 = startOfMonth()

    let today = 0
    let week = 0
    let month = 0
    let all = 0
    let todayCount = 0

    let todayTip = 0
    let weekTip = 0
    let monthTip = 0
    let allTip = 0

    // today's revenue per console (spec §9)
    const byConsole = new Map<string, number>()
    for (const c of consoles) byConsole.set(c.name, 0)

    // today's revenue by payment channel + bank
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 }
    const byBank = { TBC: 0, BOG: 0 }

    for (const s of completed) {
      const ts = new Date(s.ended_at ?? s.ends_at ?? s.started_at).getTime()
      const amt = s.price_total
      const tip = s.tip_amount
      
      all += amt
      allTip += tip
      if (ts >= m0) { month += amt; monthTip += tip; }
      if (ts >= w0) { week += amt; weekTip += tip; }
      if (ts >= t0) {
        today += amt
        todayTip += tip
        todayCount += 1
        byConsole.set(s.console_name, (byConsole.get(s.console_name) ?? 0) + amt)
        byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + amt
        if (s.bank) byBank[s.bank] = (byBank[s.bank] ?? 0) + amt
      }
    }

    const consoleRows = [...byConsole.entries()].map(([name, value]) => ({
      name,
      value,
    }))
    const max = Math.max(1, ...consoleRows.map((r) => r.value))
    const avg = todayCount ? today / todayCount : 0

    return { today, week, month, all, todayCount, avg, consoleRows, max, byMethod, byBank, todayTip, weekTip, monthTip, allTip }
  }, [completed, consoles])

  const barData = useMemo(() => {
    const t0 = startOfToday()
    const w0 = startOfWeek()
    const m0 = startOfMonth()

    let todayRev = 0, weekRev = 0, monthRev = 0, allRev = 0
    let todayCost = 0, weekCost = 0, monthCost = 0, allCost = 0
    let todayTip = 0, weekTip = 0, monthTip = 0, allTip = 0
    const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 }

    for (const b of barSales) {
      const ts = new Date(b.created_at).getTime()
      const amt = Number(b.total || 0)
      const tip = Number(b.tip_amount || 0)

      let cost = 0
      if (b.bar_sale_items) {
        for (const item of b.bar_sale_items) {
          cost += Number(item.unit_cost_price || 0) * Number(item.qty || 0)
        }
      }

      allRev += amt
      allCost += cost
      allTip += tip

      if (ts >= m0) {
        monthRev += amt
        monthCost += cost
        monthTip += tip
      }
      if (ts >= w0) {
        weekRev += amt
        weekCost += cost
        weekTip += tip
      }
      if (ts >= t0) {
        todayRev += amt
        todayCost += cost
        todayTip += tip
        const m = (b.payment_method || 'cash') as PaymentMethod
        if (byMethod[m] !== undefined) {
          byMethod[m] += amt
        }
      }
    }

    return {
       todayRev, weekRev, monthRev, allRev,
       todayCost, weekCost, monthCost, allCost,
       todayTip, weekTip, monthTip, allTip,
       todayProfit: todayRev - todayCost,
       weekProfit: weekRev - weekCost,
       monthProfit: monthRev - monthCost,
       allProfit: allRev - allCost,
       byMethod
    }
  }, [barSales])

  const nonCashToday = data.byMethod.card + data.byMethod.transfer

  const periods = [
    {
      label: 'დღეს',
      value: data.today,
      hint: `${data.todayCount} სესია`,
      icon: Coins,
      highlight: true,
    },
    { label: 'ეს კვირა', value: data.week, hint: 'ორშაბათიდან', icon: CalendarDays },
    { label: 'ეს თვე', value: data.month, hint: '1 რიცხვიდან', icon: CalendarRange },
    {
      label: 'სულ ყველა დრო',
      value: data.all,
      hint: `${completed.length} სესია`,
      icon: InfinityIcon,
    },
  ]

  return (
    <div className="space-y-6">

      {/* Მთლიანი ჯამი (სესია + ბარი) */}
      <div className="nm-raised flex flex-col gap-4 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Landmark className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">ჯამური მაჩვენებლები</h2>
            <p className="text-sm text-muted-foreground">სესია + ბარი</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'დღეს', rev: data.today + barData.todayRev, tip: data.todayTip + barData.todayTip, profit: data.today + barData.todayProfit, highlight: true },
            { label: 'ეს კვირა', rev: data.week + barData.weekRev, tip: data.weekTip + barData.weekTip, profit: data.week + barData.weekProfit },
            { label: 'ეს თვე', rev: data.month + barData.monthRev, tip: data.monthTip + barData.monthTip, profit: data.month + barData.monthProfit },
            { label: 'სულ', rev: data.all + barData.allRev, tip: data.allTip + barData.allTip, profit: data.all + barData.allProfit },
          ].map(p => (
            <div key={p.label} className={p.highlight ? 'nm-daylight rounded-2xl p-4' : 'nm-inset rounded-2xl p-4'}>
              <p className="text-sm font-semibold">{p.label}</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-xs text-muted-foreground">შემოსავალი</span>
                  <span className={`font-mono text-sm font-extrabold ${p.highlight ? 'text-primary text-glow' : ''}`}>{gel(p.rev)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-xs text-amber-400">ჩაიანი</span>
                  <span className={`font-mono text-sm font-extrabold text-amber-400`}>{gel(p.tip)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">მოგება</span>
                  <span className={`font-mono text-sm font-extrabold ${p.highlight ? 'text-primary' : 'text-green-500'}`}>{gel(p.profit)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shift Controls */}
      <div className="nm-raised flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="nm-inset flex size-12 items-center justify-center rounded-2xl">
            <ClipboardList className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-extrabold">
              {currentShiftStart ? `ცვლა გახსნილია` : 'ცვლა დახურულია'}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentShiftStart
                ? `დაიწყო: ${currentShiftStart.toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' })}${drawer?.opened_by ? ` • ${drawer.opened_by}` : ''} • ხურდა: ${gel(openingCashAmount)}`
                : 'ცვლა ჯერ არ გახსნილა'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!currentShiftStart ? (
            <button
              onClick={() => { setShiftModalMode('open'); setShiftOpen(true) }}
              className="nm-btn flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-primary"
            >
              <PlayCircle className="size-4" />
              ცვლის გახსნა
            </button>
          ) : (
            <>
              <button
                onClick={() => { loadDrawer(); setZReportVisible(v => !v) }}
                className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
              >
                <Receipt className="size-4" />
                Z-Report
              </button>
              <button
                onClick={() => { loadDrawer(); setShiftModalMode('close'); setShiftOpen(true) }}
                className="nm-btn flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-[var(--status-expired)]"
              >
                <StopCircle className="size-4" />
                ცვლის დახურვა
              </button>
            </>
          )}
        </div>
      </div>

      {/* Z-Report */}
      {zReportVisible && currentShiftStart && (
        <div className="nm-raised rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Receipt className="size-5 text-primary" />
            <h3 className="text-lg font-extrabold">Z-Report — {new Date().toLocaleDateString('ka-GE')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="nm-inset rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">ნაღდი</p>
              <p className="font-mono text-xl font-extrabold">{gel(data.byMethod.cash + barData.byMethod.cash)}</p>
            </div>
            <div className="nm-inset rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">ბარათი</p>
              <p className="font-mono text-xl font-extrabold">{gel(data.byMethod.card + barData.byMethod.card)}</p>
            </div>
            <div className="nm-inset rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">გადარიცხვა</p>
              <p className="font-mono text-xl font-extrabold">{gel(data.byMethod.transfer + barData.byMethod.transfer)}</p>
            </div>
            <div className="nm-daylight rounded-2xl p-4">
              <p className="text-xs text-muted-foreground">სულ დღეს</p>
              <p className="font-mono text-xl font-extrabold text-primary">{gel(data.today + barData.todayRev)}</p>
            </div>
          </div>
          <div className="nm-inset flex items-center justify-between rounded-2xl px-5 py-4">
            <span className="text-sm font-semibold">სალაროში მოსალოდნელია (ხურდა + ნაღდი ცვლის გახსნიდან):</span>
            <span className="font-mono text-lg font-extrabold text-primary">{gel(expectedCash)}</span>
          </div>
        </div>
      )}

      {/* period breakdown */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {periods.map((p) => (
          <div
            key={p.label}
            className={p.highlight ? 'nm-daylight rounded-3xl p-6' : 'nm-raised rounded-3xl p-6'}
          >
            <div className="flex items-center gap-3">
              <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
                <p.icon className="size-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">{p.label}</p>
            </div>
            <p
              className={`mt-4 font-mono text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${
                p.highlight ? 'text-primary text-glow' : ''
              }`}
            >
              {gel(p.value)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
          </div>
        ))}
      </div>

      {/* secondary stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="nm-raised flex items-center gap-3 rounded-3xl p-5">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Receipt className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">სესიები დღეს</p>
            <p className="font-mono text-2xl font-extrabold">{data.todayCount}</p>
          </div>
        </div>
        <div className="nm-raised flex items-center gap-3 rounded-3xl p-5">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Coins className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">საშუალო ჩეკი (დღეს)</p>
            <p className="font-mono text-2xl font-extrabold">{gel(data.avg)}</p>
          </div>
        </div>
      </div>

      {/* payment channels — today (cash vs card vs transfer, by bank) */}
      <div className="nm-raised rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold">გადახდის არხები (დღეს)</h3>
          <span className="text-xs text-muted-foreground">ნაღდი vs უნაღდო</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => {
            const Icon = METHOD_ICON[m]
            return (
              <div
                key={m}
                className="nm-inset flex items-center gap-3 rounded-2xl px-4 py-3"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--surface-2)]">
                  <Icon className="size-5 text-primary" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {paymentMethodLabel[m]}
                  </p>
                  <p className="font-mono text-lg font-extrabold">
                    {gel(data.byMethod[m])}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        {nonCashToday > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {(['TBC', 'BOG'] as const).map((b) => (
              <div
                key={b}
                className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Landmark className="size-4 text-muted-foreground" />
                  {b}
                </span>
                <span className="font-mono text-base font-extrabold text-primary">
                  {gel(data.byBank[b])}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* bar chart by console — today */}
        <div className="nm-raised rounded-3xl p-6 lg:col-span-3">
          <h3 className="text-base font-extrabold">შემოსავალი კონსოლებით</h3>
          <p className="mt-1 text-sm text-muted-foreground">დღევანდელი სესიების მიხედვით</p>
          <div className="mt-6 space-y-4">
            {data.consoleRows.map((row) => (
              <div key={row.name} className="flex items-center gap-3">
                <span className="flex w-20 items-center gap-2 text-sm font-semibold">
                  <Gamepad2 className="size-4 text-muted-foreground" />
                  {row.name}
                </span>
                <div className="nm-inset h-7 flex-1 overflow-hidden rounded-full">
                  <div
                    className="flex h-full items-center justify-end rounded-full pr-3"
                    style={{
                      width: `${Math.max(8, (row.value / data.max) * 100)}%`,
                      background:
                        'linear-gradient(90deg, color-mix(in oklch, var(--primary) 55%, transparent), var(--primary))',
                      boxShadow:
                        '0 0 14px color-mix(in oklch, var(--primary) 50%, transparent)',
                    }}
                  >
                    <span className="font-mono text-xs font-bold text-primary-foreground">
                      {gel(row.value)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* recent receipts */}
        <div className="nm-raised rounded-3xl p-6 lg:col-span-2">
          <h3 className="text-base font-extrabold">ბოლო ჩეკები</h3>
          <ul className="mt-4 space-y-3">
            {completed.slice(0, 6).map((s) => (
              <li
                key={s.id}
                className="nm-inset flex items-center justify-between rounded-2xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {s.customer_name ?? 'სტუმარი'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.console_name} • {s.plan_name} •{' '}
                    {timeOfDay(s.ended_at ?? s.ends_at ?? s.started_at)}
                  </p>
                </div>
                <span className="ml-3 shrink-0 font-mono text-sm font-extrabold text-primary">
                  {gel(s.price_total)}
                </span>
              </li>
            ))}
            {completed.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                ჯერ არ არის ჩეკები
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* --- ბარი --- */}
      <div className="nm-raised rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Coffee className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold">ბარის რეპორტი</h2>
            <p className="text-sm text-muted-foreground">გაყიდვები და მოგება</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
          {[
            { label: 'დღეს', rev: barData.todayRev, cost: barData.todayCost, profit: barData.todayProfit, highlight: true },
            { label: 'ეს კვირა', rev: barData.weekRev, cost: barData.weekCost, profit: barData.weekProfit },
            { label: 'ეს თვე', rev: barData.monthRev, cost: barData.monthCost, profit: barData.monthProfit },
            { label: 'სულ', rev: barData.allRev, cost: barData.allCost, profit: barData.allProfit },
          ].map(p => (
            <div key={p.label} className={p.highlight ? 'nm-daylight rounded-2xl p-5' : 'nm-inset rounded-2xl p-5'}>
               <p className="text-sm font-semibold mb-3">{p.label}</p>
               <div className="space-y-2 text-sm">
                 <div className="flex justify-between">
                   <span className="text-xs text-muted-foreground">შემოს.:</span>
                   <span className="font-mono font-bold">{gel(p.rev)}</span>
                 </div>
                 <div className="flex justify-between border-b border-white/5 pb-2">
                   <span className="text-xs text-muted-foreground">ხარჯი:</span>
                   <span className="font-mono font-bold text-[var(--status-expired)]">{gel(p.cost)}</span>
                 </div>
                 <div className="flex justify-between pt-1">
                   <span className="text-xs font-bold">მოგება:</span>
                   <span className={`font-mono font-extrabold ${p.highlight ? 'text-primary text-glow' : 'text-green-500'}`}>{gel(p.profit)}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold">გადახდის არხები (ბარი, დღეს)</h3>
            <span className="text-xs text-muted-foreground">ნაღდი vs უნაღდო</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICON[m]
              return (
                <div key={m} className="nm-inset flex items-center gap-3 rounded-2xl px-4 py-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--surface-2)]">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">{paymentMethodLabel[m]}</p>
                    <p className="font-mono text-lg font-extrabold">{gel(barData.byMethod[m])}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Shift modal */}

      <Modal
        open={shiftOpen}
        onClose={() => setShiftOpen(false)}
        title={shiftModalMode === 'open' ? 'ცვლის გახსნა' : 'ცვლის დახურვა / Z-Report'}
      >
        <div className="space-y-4">
          {shiftModalMode === 'open' ? (
            <>
              <p className="text-sm text-muted-foreground">
                მიუთითეთ სალაროში არსებული ნაღდი ფული ცვლის დაწყების მომენტში:
              </p>
              <label className="block">
                <span className="text-sm font-semibold text-muted-foreground">სალაროს ხურდა (₾)</span>
                <input
                  type="number" min="0" step="0.5"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm font-mono font-bold outline-none text-primary"
                />
              </label>
              <button
                onClick={async () => {
                  if (!currentVenueId) return
                  const { data, error } = await supabase.rpc('open_cash_drawer', {
                    p_venue_id: currentVenueId,
                    p_opening_cash: parseFloat(openingCash) || 0,
                  })
                  if (error) return pushToast('danger', error.message)
                  const res = data as { ok?: boolean; error?: string } | null
                  if (res?.error === 'already_open') {
                    pushToast('info', 'ცვლა უკვე გახსნილია ამ ფილიალზე')
                  }
                  await loadDrawer()
                  setOpeningCash('')
                  setShiftOpen(false)
                  setZReportVisible(false)
                }}
                className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-primary"
              >
                <PlayCircle className="size-4" />
                ცვლის გახსნა
              </button>
            </>
          ) : (
            <>
              <div className="nm-inset space-y-3 rounded-2xl p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ნაღდი გაყიდვები (ცვლის გახსნიდან):</span>
                  <span className="font-mono font-bold">{gel(expectedCash - openingCashAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">საწყისი ხურდა:</span>
                  <span className="font-mono font-bold">{gel(openingCashAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-3">
                  <span className="font-semibold">სალაროში მოსალოდნელი:</span>
                  <span className="font-mono font-extrabold text-primary">{gel(expectedCash)}</span>
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-muted-foreground">დათვლილი ფული სალაროში (₾)</span>
                <input
                  type="number" min="0" step="0.5"
                  value={closingCash}
                  onChange={e => setClosingCash(e.target.value)}
                  placeholder="0.00"
                  className="nm-inset mt-2 w-full rounded-2xl px-4 py-3 text-sm font-mono font-bold outline-none text-primary"
                />
              </label>
              {closingCash && (
                <div className={`nm-inset flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
                  Math.abs(parseFloat(closingCash) - expectedCash) < 0.01
                    ? 'text-green-400' : 'text-[var(--status-expired)]'
                }`}>
                  {Math.abs(parseFloat(closingCash) - expectedCash) < 0.01 ? (
                    <><CheckCircle2 className="size-4" /> სალარო ზუსტია!</>
                  ) : (
                    <><AlertCircle className="size-4" />
                      სხვაობა: {gel(parseFloat(closingCash) - expectedCash)}
                    </>
                  )}
                </div>
              )}
              <button
                onClick={async () => {
                   if (!currentVenueId) return
                   const actual = parseFloat(closingCash) || 0
                   const { data, error } = await supabase.rpc('close_cash_drawer', {
                     p_venue_id: currentVenueId,
                     p_closing_cash: actual,
                     p_note: '',
                   })
                   if (error) return pushToast('danger', error.message)
                   const res = data as { ok?: boolean; error?: string; difference?: number; alert?: boolean } | null
                   if (res?.error === 'no_open_drawer') {
                     pushToast('info', 'ცვლა უკვე დახურულია')
                   } else if (res?.alert) {
                     pushToast('danger', 'ყურადღება: სალაროში აღინიშნა სხვაობა!')
                   }

                   await loadDrawer()
                   setOpeningCash('')
                   setClosingCash('')
                   setZReportVisible(false)
                   setShiftOpen(false)

                   if (res?.ok) {
                     pushToast('info', `ცვლა დაიხურა. სხვაობა: ${gel(res.difference ?? 0)}`)
                   }
                }}
                className="nm-btn flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-[var(--status-expired)]"
              >
                <StopCircle className="size-4" />
                ცვლის დახურვა
              </button>
            </>
          )}
        </div>
      </Modal>

    </div>
  )
}
