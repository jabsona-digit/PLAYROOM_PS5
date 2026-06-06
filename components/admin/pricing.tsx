'use client'

import { useState } from 'react'
import { Check, Gamepad2, Minus, Plus, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayroom } from '@/lib/store'
import { gel } from '@/lib/ui'
import type { PricingPlan } from '@/lib/types'

function PlanCard({ plan }: { plan: PricingPlan }) {
  const { updatePlanPrice, togglePlanActive } = usePlayroom()
  const [draft, setDraft] = useState(plan.price_per_hour)
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

        <button
          type="button"
          role="switch"
          aria-checked={plan.is_active}
          onClick={() => togglePlanActive(plan.id)}
          className={cn(
            'relative h-7 w-12 rounded-full transition-colors',
            plan.is_active ? 'nm-inset' : 'nm-inset',
          )}
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
      </div>

      <div className="nm-inset mt-6 flex items-center justify-between rounded-2xl px-3 py-3">
        <button
          type="button"
          aria-label="ფასის შემცირება"
          onClick={() => setDraft((d) => Math.max(1, Math.round((d - 0.5) * 2) / 2))}
          className="nm-btn flex size-10 items-center justify-center rounded-xl"
        >
          <Minus className="size-4" />
        </button>
        <div className="text-center">
          <p className="font-mono text-3xl font-extrabold text-primary">
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

export function Pricing() {
  const { plans } = usePlayroom()
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
    </div>
  )
}
