'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Plus, Trash2, Clock, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'

// dynamic_pricing_rules ships in migration 0067; DB types regenerate on deploy.
const dpr = () => supabase.from('dynamic_pricing_rules' as never) as any

interface Rule {
  id: string
  name: string
  rule_type: 'happy_hour' | 'surge' | 'custom'
  days_of_week: number[]
  time_from: string | null
  time_to: string | null
  multiplier: number
  is_active: boolean
}

// Postgres dow: 0=Sun..6=Sat. Display Mon-first.
const DOW = [
  { v: 1, t: 'ორ' }, { v: 2, t: 'სა' }, { v: 3, t: 'ოთ' }, { v: 4, t: 'ხუ' },
  { v: 5, t: 'პა' }, { v: 6, t: 'შა' }, { v: 0, t: 'კვ' },
]

function pctLabel(mult: number) {
  const pct = Math.round((mult - 1) * 100)
  if (pct === 0) return '±0%'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export function DynamicPricing() {
  const { currentOrgId, currentVenueId } = useOrg()
  const { pushToast } = usePlayroom()
  const [rules, setRules] = useState<Rule[]>([])
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    if (!currentVenueId) return
    const { data } = await dpr().select('*').eq('venue_id', currentVenueId).order('priority', { ascending: false })
    setRules((data as Rule[]) ?? [])
  }, [currentVenueId])
  useEffect(() => { load() }, [load])

  const toggle = async (r: Rule) => {
    const { error } = await dpr().update({ is_active: !r.is_active }).eq('id', r.id)
    if (error) return pushToast('danger', error.message)
    load()
  }
  const remove = async (id: string) => {
    const { error } = await dpr().delete().eq('id', id)
    if (error) return pushToast('danger', error.message)
    load()
  }

  return (
    <section className="nm-raised mt-6 rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <Zap className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">დინამიური ფასი</h2>
            <p className="text-xs text-muted-foreground">
              ფასი დღის/საათის მიხედვით — Happy Hour (მკვდარი საათების შევსება) ან Surge (პიკზე).
            </p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="nm-btn flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
        >
          <Plus className="size-4" /> წესი
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="nm-inset rounded-2xl p-6 text-center text-sm text-muted-foreground">
          წესები არ არის — ფასი სტანდარტულია. დაამატე Happy Hour, რომ ცარიელი საათები აავსო.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rules.map((r) => {
            const discount = r.multiplier < 1
            return (
              <div key={r.id} className="nm-inset flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                <div className="min-w-32 flex-1">
                  <p className="font-bold leading-tight">{r.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{r.days_of_week.length === 0 ? 'ყოველდღე' : DOW.filter((d) => r.days_of_week.includes(d.v)).map((d) => d.t).join(' ')}</span>
                    {(r.time_from || r.time_to) && (
                      <span className="flex items-center gap-1"><Clock className="size-3" />{hhmm(r.time_from) ?? '00:00'}–{hhmm(r.time_to) ?? '24:00'}</span>
                    )}
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-sm font-black tabular-nums"
                  style={{
                    background: `color-mix(in oklch, ${discount ? 'var(--status-free)' : 'var(--status-expired)'} 14%, transparent)`,
                    color: discount ? 'var(--status-free)' : 'var(--status-expired)',
                  }}
                >
                  {pctLabel(r.multiplier)}
                </span>
                <button
                  onClick={() => toggle(r)}
                  role="switch"
                  aria-checked={r.is_active}
                  className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', r.is_active ? 'bg-primary' : 'bg-muted-foreground/30')}
                >
                  <span className={cn('absolute top-1 size-5 rounded-full bg-white transition-all', r.is_active ? 'left-6' : 'left-1')} />
                </button>
                <button onClick={() => remove(r.id)} className="nm-btn flex size-9 items-center justify-center rounded-xl text-muted-foreground">
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {addOpen && (
        <AddRuleModal
          orgId={currentOrgId}
          venueId={currentVenueId}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load() }}
        />
      )}
    </section>
  )
}

function AddRuleModal({
  orgId, venueId, onClose, onSaved,
}: { orgId: string | null; venueId: string | null; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = usePlayroom()
  const [name, setName] = useState('')
  const [type, setType] = useState<'happy_hour' | 'surge'>('happy_hour')
  const [pct, setPct] = useState(25)
  const [days, setDays] = useState<number[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState(false)

  const multiplier = type === 'happy_hour'
    ? Math.round((1 - pct / 100) * 100) / 100
    : Math.round((1 + pct / 100) * 100) / 100

  const toggleDay = (v: number) => setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]))

  const save = async () => {
    if (!orgId || !venueId || !name.trim()) return
    setSaving(true)
    const { error } = await dpr().insert({
      org_id: orgId,
      venue_id: venueId,
      name: name.trim(),
      rule_type: type,
      days_of_week: days,
      time_from: from || null,
      time_to: to || null,
      multiplier,
      priority: type === 'happy_hour' ? 10 : 20, // surge wins ties
    })
    setSaving(false)
    if (error) return pushToast('danger', error.message)
    pushToast('success', 'წესი დაემატა')
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="დინამიური ფასის წესი">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">სახელი</span>
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="მაგ: Happy Hour — სამუშაო დღეები"
            className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setType('happy_hour')}
            className={cn('rounded-2xl py-3 text-sm font-bold', type === 'happy_hour' ? 'nm-daylight text-[var(--status-free)]' : 'nm-btn text-muted-foreground')}>
            🟢 Happy Hour (−)
          </button>
          <button onClick={() => setType('surge')}
            className={cn('rounded-2xl py-3 text-sm font-bold', type === 'surge' ? 'nm-daylight text-[var(--status-expired)]' : 'nm-btn text-muted-foreground')}>
            🔥 Surge (+)
          </button>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Percent className="size-4" /> ცვლილება — <b className="text-foreground">{pctLabel(multiplier)}</b>
          </p>
          <div className="nm-inset flex items-center justify-between rounded-2xl px-3 py-2">
            <button onClick={() => setPct((p) => Math.max(5, p - 5))} className="nm-btn size-9 rounded-xl text-lg font-bold">−</button>
            <span className="font-mono text-xl font-extrabold text-primary">{pct}%</span>
            <button onClick={() => setPct((p) => Math.min(80, p + 5))} className="nm-btn size-9 rounded-xl text-lg font-bold">+</button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">დღეები (ცარიელი = ყოველდღე)</p>
          <div className="flex flex-wrap gap-2">
            {DOW.map((d) => (
              <button key={d.v} onClick={() => toggleDay(d.v)}
                className={cn('size-10 rounded-xl text-xs font-bold', days.includes(d.v) ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground')}>
                {d.t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">დან (არჩევითი)</span>
            <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
              className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground">მდე (არჩევითი)</span>
            <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
              className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none" />
          </label>
        </div>

        <button onClick={save} disabled={saving || !name.trim()}
          className="nm-daylight w-full rounded-2xl py-3.5 text-sm font-black text-primary disabled:opacity-50">
          {saving ? 'ინახება...' : 'შენახვა'}
        </button>
      </div>
    </Modal>
  )
}
