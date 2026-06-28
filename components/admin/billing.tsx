'use client'

import { useEffect, useState } from 'react'
import { use3dTilt } from '@/lib/hooks'
import {
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Crown,
  MessageCircle,
  Users2,
  XCircle,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { supabase } from '@/lib/supabase/client'
import { gel } from '@/lib/ui'
import { CryptoSubscriptionPay } from './crypto-pay-modal'

const CONTACT_WHATSAPP = 'https://wa.me/995500057527?text=გამარჯობა%2C%20მინდა%20გამოვიწერო%20'
const CONTACT_EMAIL = 'mailto:martecompanygeo@gmail.com?subject=Martelounge%20Billing'

interface OrgDetails {
  plan: string
  subscription_status: string
  trial_ends_at: string | null
  created_at: string
  member_count: number
  venue_count: number
}

interface PlanFeature {
  text: string
  included: boolean
}

interface PlanDef {
  key: string
  label: string
  price: number
  badge?: string
  features: PlanFeature[]
}

const PLANS: PlanDef[] = [
  {
    key: 'trial',
    label: 'Trial',
    price: 0,
    features: [
      { text: '1 ფილიალი', included: true },
      { text: '4 კონსოლი', included: true },
      { text: '3 თანამშრომელი', included: true },
      { text: '14 დღე უფასოდ', included: true },
      { text: 'ბარი / POS', included: false },
      { text: 'ინვენტარი', included: false },
      { text: 'ანალიტიკა', included: false },
      { text: 'RS.GE ფისკალი', included: false },
    ],
  },
  {
    key: 'pro',
    label: 'PRO',
    price: 50,
    badge: 'პოპულარული',
    features: [
      { text: '3 ფილიალი', included: true },
      { text: '8 კონსოლი / ფილიალი', included: true },
      { text: 'Unlimited თანამშრომლები', included: true },
      { text: 'ბარი / POS', included: true },
      { text: 'ინვენტარი + საწყობი', included: true },
      { text: 'კლიენტთა ბაზა', included: true },
      { text: 'ანალიტიკა', included: true },
      { text: 'RS.GE ფისკალი', included: false },
    ],
  },
  {
    key: 'enterprise',
    label: 'ENTERPRISE',
    price: 70,
    features: [
      { text: 'Unlimited ფილიალი', included: true },
      { text: 'Unlimited კონსოლი', included: true },
      { text: 'Unlimited თანამშრომლები', included: true },
      { text: 'ბარი / POS', included: true },
      { text: 'ინვენტარი + საწყობი', included: true },
      { text: 'კლიენტთა ბაზა', included: true },
      { text: 'ანალიტიკა', included: true },
      { text: 'RS.GE ფისკალი', included: true },
      { text: 'API წვდომა', included: true },
      { text: 'პრიორიტეტული მხარდაჭერა', included: true },
    ],
  },
]

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: 'აქტიური', color: 'var(--status-free)' },
  trialing: { label: 'საცდელი', color: 'var(--status-active)' },
  past_due: { label: 'ვადაგადაცილებული', color: 'var(--status-warning5)' },
  canceled: { label: 'შეჩერებული', color: 'var(--status-expired)' },
}

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

export function Billing() {
  const { currentOrgId, orgs, venues, currentRole } = useOrg()
  const [details, setDetails] = useState<OrgDetails | null>(null)
  const [loading, setLoading] = useState(true)

  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin'

  useEffect(() => {
    if (!currentOrgId) return
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('organizations')
        .select('plan, subscription_status, trial_ends_at, created_at')
        .eq('id', currentOrgId)
        .single()

      const [memberRes] = await Promise.all([
        supabase
          .from('org_members')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', currentOrgId),
      ])

      if (data) {
        setDetails({
          plan: data.plan ?? 'trial',
          subscription_status: data.subscription_status ?? 'trialing',
          trial_ends_at: data.trial_ends_at,
          created_at: data.created_at,
          member_count: memberRes.count ?? 0,
          venue_count: venues.length,
        })
      }
      setLoading(false)
    })()
  }, [currentOrgId, venues])

  if (loading || !details) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
        იტვირთება...
      </div>
    )
  }

  const org = orgs.find((o) => o.id === currentOrgId)
  const plan = details.plan ?? 'trial'
  const status = STATUS_META[details.subscription_status] ?? STATUS_META.trialing
  const trialDays = details.subscription_status === 'trialing' ? daysLeft(details.trial_ends_at) : null
  const currentPlanDef = PLANS.find((p) => p.key === plan) ?? PLANS[0]

  const upgradeUrl = (planKey: string) =>
    `${CONTACT_WHATSAPP}${planKey.toUpperCase()}%20პლანი`

  return (
    <div className="space-y-6">
      {/* Current plan card */}
      <div className="nm-raised rounded-3xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="nm-inset flex size-14 items-center justify-center rounded-2xl">
              {plan === 'enterprise' ? (
                <Crown className="size-7 text-primary" />
              ) : plan === 'pro' ? (
                <Zap className="size-7 text-primary" />
              ) : (
                <CreditCard className="size-7 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold">
                  {org?.name ?? 'ორგანიზაცია'}
                </h2>
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    color: status.color,
                    background: `color-mix(in oklch, ${status.color} 14%, transparent)`,
                  }}
                >
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                პლანი:{' '}
                <span className="font-bold text-foreground">
                  {currentPlanDef.label}
                  {currentPlanDef.price > 0 ? ` — ${gel(currentPlanDef.price)}/თვე` : ' — უფასო'}
                </span>
              </p>
            </div>
          </div>

          {isOwnerOrAdmin && plan !== 'enterprise' && (
            <div className="flex flex-col gap-2 self-start sm:items-end">
              <a
                href={upgradeUrl(plan === 'trial' ? 'pro' : 'enterprise')}
                target="_blank"
                rel="noreferrer"
                className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
              >
                <MessageCircle className="size-4" />
                {plan === 'trial' ? 'PRO-ზე გადასვლა' : 'ENTERPRISE-ზე გადასვლა'}
              </a>
            </div>
          )}
        </div>

        {/* Trial countdown */}
        {trialDays !== null && (
          <div
            className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background:
                trialDays <= 3
                  ? 'color-mix(in oklch, var(--status-expired) 10%, transparent)'
                  : 'color-mix(in oklch, var(--status-active) 10%, transparent)',
              boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${trialDays <= 3 ? 'var(--status-expired)' : 'var(--status-active)'} 30%, transparent)`,
            }}
          >
            <Calendar
              className="size-5 shrink-0"
              style={{ color: trialDays <= 3 ? 'var(--status-expired)' : 'var(--status-active)' }}
            />
            <p
              className="text-sm font-bold"
              style={{ color: trialDays <= 3 ? 'var(--status-expired)' : 'var(--status-active)' }}
            >
              {trialDays === 0
                ? 'Trial-ი დასრულდა — გთხოვთ განაახლოთ'
                : `Trial-ი: ${trialDays} დღე დარჩა`}
            </p>
          </div>
        )}

        {/* Canceled warning */}
        {details.subscription_status === 'canceled' && (
          <div
            className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{
              background: 'color-mix(in oklch, var(--status-expired) 10%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--status-expired) 30%, transparent)',
            }}
          >
            <XCircle className="size-5 shrink-0" style={{ color: 'var(--status-expired)' }} />
            <p className="text-sm font-bold" style={{ color: 'var(--status-expired)' }}>
              გამოწერა შეჩერებულია — დასაბრუნებლად დაგვიკავშირდით
            </p>
          </div>
        )}

        {/* Usage stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat icon={Building2} label="ფილიალები" value={String(details.venue_count)} />
          <Stat icon={Users2} label="წევრები" value={String(details.member_count)} />
          <Stat
            icon={BadgeCheck}
            label="გამოწერა"
            value={new Date(details.created_at).toLocaleDateString('ka-GE', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          />
        </div>
      </div>

      {/* Plan comparison */}
      <div className="nm-raised rounded-3xl p-6">
        <h3 className="mb-5 flex items-center gap-2 text-base font-extrabold">
          <Crown className="size-5 text-primary" />
          პლანები
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = p.key === plan
            return (
              <div
                key={p.key}
                className={cn(
                  'relative flex flex-col rounded-2xl p-5',
                  isCurrent ? 'nm-daylight' : 'nm-inset',
                )}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-0.5 text-[10px] font-extrabold text-white">
                    {p.badge}
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--status-free)] px-3 py-0.5 text-[10px] font-extrabold text-white">
                    მიმდინარე
                  </span>
                )}

                <p
                  className={cn(
                    'text-base font-extrabold',
                    isCurrent ? 'text-primary text-glow' : '',
                  )}
                >
                  {p.label}
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold">
                  {p.price === 0 ? 'უფასო' : `${gel(p.price)}`}
                  {p.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">/თვე</span>
                  )}
                </p>

                <ul className="mt-4 flex-1 space-y-2">
                  {p.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--status-free)]" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-40" />
                      )}
                      <span
                        className={cn(
                          f.included ? 'text-foreground' : 'text-muted-foreground opacity-50',
                        )}
                      >
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {isOwnerOrAdmin && !isCurrent && p.key !== 'trial' && (
                  <a
                    href={upgradeUrl(p.key)}
                    target="_blank"
                    rel="noreferrer"
                    className="nm-btn mt-5 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-primary"
                  >
                    <MessageCircle className="size-4" />
                    {p.key === 'pro' ? 'PRO-ზე გადასვლა' : 'ENTERPRISE-ზე'}
                  </a>
                )}
                {isCurrent && (
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold text-[var(--status-free)]">
                      <CheckCircle2 className="size-4" />
                      მიმდინარე პლანი
                    </div>
                    {isOwnerOrAdmin && p.key !== 'trial' && (
                      <CryptoSubscriptionPay
                        orgId={currentOrgId}
                        plan={plan}
                        buttonClassName="nm-btn flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-primary"
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Invoices placeholder */}
      <div className="nm-raised rounded-3xl p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-extrabold">
          <CreditCard className="size-5 text-primary" />
          ინვოისები
        </h3>
        <p className="py-8 text-center text-sm text-muted-foreground">
          ინვოისები გამოჩნდება გადახდის სისტემის ინტეგრაციის შემდეგ.
          <br />
          ახლა ანგარიშსწორება ხდება ხელნაწერი ინვოისით.{' '}
          <a
            href={CONTACT_EMAIL}
            className="text-primary underline underline-offset-2"
          >
            დაგვიკავშირდით
          </a>
          .
        </p>
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2
  label: string
  value: string
}) {
  const { style, onMouseMove, onMouseLeave } = use3dTilt(5)
  return (
    <div className="nm-inset flex items-center gap-3 rounded-2xl p-3" style={style} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-bold">{value}</p>
      </div>
    </div>
  )
}
