'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCountUp, use3dTilt } from '@/lib/hooks'
import { BarChart3, Coins, Flame, TrendingUp } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'

interface Point {
  revenue: number[] // per month — session revenue + bar SALES (gross revenue)
  profit: number[] // per month — session revenue + bar PROFIT (gaming has no COGS)
  hours: number[] // activity count per hour-of-day (0..23)
}

const MONTH_FMT = (d: Date) => d.toLocaleDateString('ka-GE', { month: 'short' })

export function Analytics() {
  const { currentVenueId } = useOrg()
  const [data, setData] = useState<Point | null>(null)
  const [barsReady, setBarsReady] = useState(false)
  const barsTriggered = useRef(false)

  // last 6 month buckets, oldest → newest
  const months = useMemo(() => {
    const out: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: MONTH_FMT(d),
      })
    }
    return out
  }, [])

  useEffect(() => {
    if (!currentVenueId) return
    let alive = true
    const from = new Date()
    from.setMonth(from.getMonth() - 5)
    from.setDate(1)
    from.setHours(0, 0, 0, 0)
    const fromIso = from.toISOString()

    ;(async () => {
      const [{ data: sess }, { data: barSales }] = await Promise.all([
        supabase
          .from('sessions')
          .select('price_total, started_at, ended_at')
          .eq('venue_id', currentVenueId)
          .eq('status', 'completed')
          .gte('ended_at', fromIso),
        supabase
          .from('bar_sales')
          .select('total, created_at, bar_sale_items(line_total, unit_cost_price, qty)')
          .eq('venue_id', currentVenueId)
          .gte('created_at', fromIso),
      ])
      if (!alive) return

      const idx = new Map(months.map((m, i) => [m.key, i]))
      const key = (iso: string) => iso.slice(0, 7)
      const revenue = new Array(months.length).fill(0)
      const profit = new Array(months.length).fill(0)
      const hours = new Array(24).fill(0)

      for (const s of sess ?? []) {
        const amt = Number(s.price_total) || 0
        const i = idx.get(key(s.ended_at ?? s.started_at))
        if (i != null) {
          revenue[i] += amt
          profit[i] += amt // gaming has no COGS → revenue = profit
        }
        hours[new Date(s.started_at).getHours()]++
      }
      for (const b of barSales ?? []) {
        const i = idx.get(key(b.created_at))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (b.bar_sale_items ?? []) as any[]
        let barProfit = 0
        for (const it of items) {
          barProfit +=
            (Number(it.line_total) || 0) -
            (Number(it.unit_cost_price) || 0) * (Number(it.qty) || 0)
        }
        if (i != null) {
          revenue[i] += Number(b.total) || 0 // bar SALES count toward revenue
          profit[i] += barProfit // …but only the margin counts toward profit
        }
        hours[new Date(b.created_at).getHours()]++
      }

      setData({ revenue, profit, hours })
      if (!barsTriggered.current) {
        barsTriggered.current = true
        requestAnimationFrame(() => requestAnimationFrame(() => setBarsReady(true)))
      }
    })()

    return () => {
      alive = false
    }
  }, [currentVenueId, months])

  const totals = useMemo(() => {
    if (!data) return { revenue: 0, profit: 0, peakHour: -1, peakVal: 0 }
    const revenue = data.revenue.reduce((a, b) => a + b, 0)
    const profit = data.profit.reduce((a, b) => a + b, 0)
    let peakHour = -1
    let peakVal = 0
    data.hours.forEach((v, h) => {
      if (v > peakVal) {
        peakVal = v
        peakHour = h
      }
    })
    return { revenue, profit, peakHour, peakVal }
  }, [data])

  const maxProfit = data ? Math.max(1, ...data.profit) : 1
  const maxHour = data ? Math.max(1, ...data.hours) : 1
  const hasData = !!data && (totals.revenue > 0 || totals.peakVal > 0)

  return (
    <section className="space-y-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
        <BarChart3 className="size-5 text-primary" />
        ანალიტიკა
        <span className="text-xs font-normal text-muted-foreground">ბოლო 6 თვე</span>
      </h2>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0s both' }}>
          <KpiCard icon={Coins} label="შემოსავალი" value={gel(totals.revenue)} countup={totals.revenue} formatCountup={gel} />
        </div>
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0.1s both' }}>
          <KpiCard icon={TrendingUp} label="სუფთა მოგება" value={gel(totals.profit)} countup={totals.profit} formatCountup={gel} accent="var(--status-free)" />
        </div>
        <div style={{ animation: 'slide-in-up 0.4s ease-out 0.2s both' }}>
          <KpiCard
            icon={Flame}
            label="პიკის საათი"
            value={totals.peakHour >= 0 ? `${String(totals.peakHour).padStart(2, '0')}:00` : '—'}
            hint={totals.peakVal ? `${totals.peakVal} აქტივობა` : 'მონაცემი არ არის'}
            accent="var(--status-warning5)"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly profit bars */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold">მოგება თვეების მიხედვით</h3>
          <p className="mt-1 text-sm text-muted-foreground">სესიები + ბარის სუფთა მოგება</p>

          {hasData ? (
            <div className="mt-8 flex h-52 items-end justify-between gap-3">
              {months.map((m, i) => {
                const val = data!.profit[i]
                const pct = Math.max(2, (val / maxProfit) * 100)
                return (
                  <div
                    key={m.key}
                    className="flex flex-1 flex-col items-center gap-2"
                    style={{ animation: `slide-in-up 0.4s ease-out ${i * 0.08}s both` }}
                  >
                    <span className="font-mono text-[11px] font-bold text-primary">
                      {val > 0 ? gel(val) : ''}
                    </span>
                    <div className="nm-inset flex h-40 w-full items-end overflow-hidden rounded-xl">
                      <div
                        className="w-full rounded-xl transition-[height] duration-700 ease-out"
                        style={{
                          height: barsReady ? `${pct}%` : '0%',
                          background:
                            'linear-gradient(180deg, var(--primary), color-mix(in oklch, var(--primary) 45%, transparent))',
                          boxShadow: '0 0 16px color-mix(in oklch, var(--primary) 45%, transparent)',
                          transitionDelay: `${i * 0.06}s`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyChart />
          )}
        </div>

        {/* Peak hours heatmap */}
        <div className="nm-raised rounded-3xl p-6">
          <h3 className="text-base font-extrabold">დატვირთული საათები</h3>
          <p className="mt-1 text-sm text-muted-foreground">აქტივობა საათების მიხედვით (სითბური რუკა)</p>

          {hasData ? (
            <>
              <div className="mt-8 flex items-end gap-[3px]">
                {data!.hours.map((v, h) => {
                  const intensity = v / maxHour
                  const isPeak = h === totals.peakHour && v > 0
                  return (
                    <div key={h} className="flex flex-1 flex-col items-center gap-2" title={`${String(h).padStart(2, '0')}:00 — ${v}`}>
                      <div
                        className="h-24 w-full rounded-[4px]"
                        style={{
                          background:
                            v === 0
                              ? 'var(--surface)'
                              : `color-mix(in oklch, var(--primary) ${15 + intensity * 85}%, var(--surface))`,
                          boxShadow: isPeak
                            ? '0 0 12px color-mix(in oklch, var(--primary) 70%, transparent), inset 0 0 0 1px var(--primary)'
                            : 'inset 2px 2px 5px var(--nm-dark), inset -2px -2px 5px var(--nm-light)',
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>
    </section>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  countup,
  formatCountup,
}: {
  icon: typeof Coins
  label: string
  value: string
  hint?: string
  accent?: string
  countup?: number
  formatCountup?: (n: number) => string
}) {
  const { style, onMouseMove, onMouseLeave } = use3dTilt(4)
  const animated = useCountUp(countup ?? 0)
  const displayValue =
    countup !== undefined
      ? formatCountup
        ? formatCountup(animated)
        : String(Math.round(animated))
      : value

  return (
    <div
      className="nm-raised flex cursor-default items-center gap-3 rounded-3xl p-5"
      style={style}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
        <Icon className="size-5" style={{ color: accent ?? 'var(--primary)' }} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-extrabold" style={accent ? { color: accent } : undefined}>
          {displayValue}
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="mt-6 flex h-52 flex-col items-center justify-center gap-2 text-center">
      <BarChart3 className="size-8 text-muted-foreground opacity-40" />
      <p className="text-sm text-muted-foreground">ჯერ არ არის საკმარისი მონაცემი</p>
      <p className="text-xs text-muted-foreground">სესიები და გაყიდვები აქ გამოჩნდება</p>
    </div>
  )
}
