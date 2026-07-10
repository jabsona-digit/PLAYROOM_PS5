'use client'

import { useState } from 'react'
import { Check, Gamepad2, Minus, Plus, Tag, Trash2, X, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { gel } from '@/lib/ui'
import type { PricingPlan } from '@/lib/types'
import { Modal } from './modal'
import { DynamicPricing } from './dynamic-pricing'
import { ModuleTabs } from './module-tabs'

// What a tariff applies to: asset class + optional sub-type (console_type). The
// sub-types (PS5/VIP under playroom, snooker under billiard) sit UNDER their class —
// VIP is a playroom sub-type, not its own category. null/null = applies to everything.
const PLAN_TARGETS: { category: string | null; console_type: string | null; label: string }[] = [
  { category: null,       console_type: null,       label: 'ყველა' },
  { category: 'playroom', console_type: 'standard', label: '🎮 PS5' },
  { category: 'playroom', console_type: 'vip',      label: '👑 VIP' },
  { category: 'playroom', console_type: null,       label: '🎮 ფლეირუმი (ყველა)' },
  { category: 'billiard', console_type: null,       label: '🎱 ბილიარდი' },
  { category: 'billiard', console_type: 'snooker',  label: '🎱 სნუკერი' },
  { category: 'karaoke',  console_type: null,       label: '🎤 კარაოკე' },
  { category: 'vr',       console_type: null,       label: '🥽 VR' },
]
const sameTarget = (
  p: { category?: string | null; console_type?: string | null },
  t: { category: string | null; console_type: string | null },
) => (p.category ?? null) === t.category && (p.console_type ?? null) === t.console_type

function PlanCard({ plan }: { plan: PricingPlan }) {
  const { updatePlanPrice, togglePlanActive, updatePlanCategory, removePlan } = usePlayroom()
  const [draft, setDraft] = useState(plan.price_per_hour)
  const [confirmDel, setConfirmDel] = useState(false)
  const dirty = draft !== plan.price_per_hour

  return (
    <div className="nm-raised rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-12 items-center justify-center rounded-2xl">
            <Tag className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-extrabold">{plan.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gamepad2 className="size-3.5" />
              {plan.controllers} ჯოისტიკი
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {confirmDel ? (
            <>
              <button
                type="button"
                aria-label="წაშლის დადასტურება"
                onClick={() => {
                  removePlan(plan.id)
                  setConfirmDel(false)
                }}
                className="nm-btn flex size-9 items-center justify-center rounded-xl text-[var(--status-expired)]"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                aria-label="გაუქმება"
                onClick={() => setConfirmDel(false)}
                className="nm-btn flex size-9 items-center justify-center rounded-xl text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label="ტარიფის წაშლა"
                onClick={() => setConfirmDel(true)}
                className="nm-btn flex size-9 items-center justify-center rounded-xl text-muted-foreground"
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={plan.is_active}
                aria-label="ტარიფის გააქტიურება"
                onClick={() => togglePlanActive(plan.id)}
                className="nm-inset relative h-7 w-12 rounded-full transition-colors"
              >
                <span
                  className={cn(
                    'absolute top-1 size-5 rounded-full transition-all',
                    plan.is_active
                      ? 'left-6 bg-primary shadow-[0_0_12px_var(--primary)]'
                      : 'left-1 bg-muted-foreground',
                  )}
                />
              </button>
            </>
          )}
        </div>
      </div>

      {/* The bare toggle confused the owner (an OFF tariff silently vanishes from the
          start-session modal) — say it out loud. */}
      {!plan.is_active && (
        <p
          className="mt-3 rounded-xl px-3 py-2 text-xs font-bold"
          style={{
            color: 'var(--status-warning5)',
            background: 'color-mix(in oklch, var(--status-warning5) 12%, transparent)',
          }}
        >
          ⏸ ტარიფი გამორთულია — სესიის დაწყებისას არ გამოჩნდება. ჩასართავად გადართე ზედა გადამრთველი.
        </p>
      )}

      <div className="mt-5">
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">ვისთვის (ერთეულის ტიპი)</p>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_TARGETS.map((t) => {
            const active = sameTarget(plan, t)
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => updatePlanCategory(plan.id, t.category, t.console_type)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-bold transition-colors',
                  active ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="nm-inset mt-4 flex items-center justify-between rounded-2xl px-3 py-3">
        <button
          type="button"
          aria-label="ფასის შემცირება"
          onClick={() => setDraft((d) => Math.max(1, Math.round((d - 0.5) * 2) / 2))}
          className="nm-btn flex size-10 items-center justify-center rounded-xl"
        >
          <Minus className="size-4" />
        </button>
        <div className="text-center">
          <p className="font-mono text-2xl sm:text-3xl font-extrabold text-primary tabular-nums">
            {gel(draft)}
          </p>
          <p className="text-xs text-muted-foreground">საათში</p>
        </div>
        <button
          type="button"
          aria-label="ფასის გაზრდა"
          onClick={() => setDraft((d) => Math.round((d + 0.5) * 2) / 2)}
          className="nm-btn flex size-10 items-center justify-center rounded-xl"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <button
        type="button"
        disabled={!dirty}
        onClick={() => updatePlanPrice(plan.id, draft)}
        className={cn(
          'mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold transition-opacity',
          dirty ? 'nm-btn text-primary' : 'nm-inset text-muted-foreground opacity-60',
        )}
      >
        <Check className="size-4" />
        {dirty ? 'ფასის შენახვა' : 'შენახულია'}
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground text-pretty">
        ცვლილება მოქმედებს მხოლოდ ახალ სესიებზე — მიმდინარე სესიები უცვლელია.
      </p>
    </div>
  )
}

function AddPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addPlan } = usePlayroom()
  const [name, setName] = useState('')
  const [controllers, setControllers] = useState(2)
  const [price, setPrice] = useState(5)
  const [target, setTarget] = useState(PLAN_TARGETS[0])

  const reset = () => {
    setName('')
    setControllers(2)
    setPrice(5)
    setTarget(PLAN_TARGETS[0])
  }

  return (
    <Modal open={open} onClose={onClose} title="ახალი ტარიფი">
      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-semibold text-muted-foreground">სახელი</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="მაგ: კუპე Premium"
            className="nm-inset mt-1.5 w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">ვისთვის (ერთეულის ტიპი)</p>
          <div className="flex flex-wrap gap-1.5">
            {PLAN_TARGETS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setTarget(t)}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors',
                  sameTarget(target, t) ? 'nm-daylight text-primary' : 'nm-btn text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">ჯოისტიკების რაოდენობა</p>
          <div className="nm-inset flex items-center justify-between rounded-2xl px-3 py-3">
            <button
              type="button"
              aria-label="შემცირება"
              onClick={() => setControllers((c) => Math.max(1, c - 1))}
              className="nm-btn flex size-10 items-center justify-center rounded-xl"
            >
              <Minus className="size-4" />
            </button>
            <div className="flex items-center gap-2 text-center">
              <Gamepad2 className="size-5 text-primary" />
              <span className="font-mono text-2xl font-extrabold text-primary">{controllers}</span>
            </div>
            <button
              type="button"
              aria-label="გაზრდა"
              onClick={() => setControllers((c) => Math.min(8, c + 1))}
              className="nm-btn flex size-10 items-center justify-center rounded-xl"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">ფასი საათში</p>
          <div className="nm-inset flex items-center justify-between rounded-2xl px-3 py-3">
            <button
              type="button"
              aria-label="ფასის შემცირება"
              onClick={() => setPrice((p) => Math.max(1, Math.round((p - 0.5) * 2) / 2))}
              className="nm-btn flex size-10 items-center justify-center rounded-xl"
            >
              <Minus className="size-4" />
            </button>
            <p className="font-mono text-2xl font-extrabold text-primary">{gel(price)}</p>
            <button
              type="button"
              aria-label="ფასის გაზრდა"
              onClick={() => setPrice((p) => Math.round((p + 0.5) * 2) / 2)}
              className="nm-btn flex size-10 items-center justify-center rounded-xl"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="nm-btn flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
          >
            გაუქმება
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={async () => {
              await addPlan({ name, controllers, price_per_hour: price, category: target.category, console_type: target.console_type })
              reset()
              onClose()
            }}
            className="nm-daylight flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary disabled:opacity-50"
          >
            დამატება
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Pricing() {
  const { plans } = usePlayroom()
  const [addOpen, setAddOpen] = useState(false)

  const tabs = [
    {
      id: 'plans',
      label: 'ტარიფები',
      icon: <Tag className="size-4" />,
      content: (
        <div className="grid gap-5 sm:grid-cols-2">
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="nm-btn flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl text-muted-foreground"
          >
            <span className="nm-inset flex size-14 items-center justify-center rounded-2xl">
              <Plus className="size-6 text-primary" />
            </span>
            <span className="text-sm font-bold">ახალი ტარიფის დამატება</span>
          </button>
        </div>
      ),
      wide: true,
    },
    {
      id: 'dynamic',
      label: 'დინამიური',
      icon: <TrendingUp className="size-4" />,
      content: <DynamicPricing />,
      wide: true,
    },
  ]

  return (
    <>
      <ModuleTabs tabs={tabs} desktopClassName="space-y-6" />
      <AddPlanModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  )
}
