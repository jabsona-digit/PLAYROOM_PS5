'use client'

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Check, Save, Trash2, ShieldCheck, X, Lock } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// payment RPCs ship in migration 0058; DB types regenerate on deploy.
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>)(fn, args)

interface PaymentSetting {
  provider: 'tbc' | 'bog'
  merchant_id: string | null
  is_active: boolean
  status: string
  configured: boolean
}

const PROVIDERS: { key: 'bog' | 'tbc'; name: string; hasApiKey: boolean }[] = [
  { key: 'bog', name: 'BOG — საქართველოს ბანკი', hasApiKey: false },
  { key: 'tbc', name: 'TBC ბანკი', hasApiKey: true },
]

function ProviderCard({
  provider,
  name,
  hasApiKey,
  existing,
  orgId,
  onChanged,
}: {
  provider: 'bog' | 'tbc'
  name: string
  hasApiKey: boolean
  existing?: PaymentSetting
  orgId: string
  onChanged: () => void
}) {
  const { pushToast } = usePlayroom()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [merchantId, setMerchantId] = useState('')
  const [secret, setSecret] = useState('')
  const [apiKey, setApiKey] = useState('')

  const connected = !!existing?.configured

  const save = async () => {
    if (!merchantId.trim() || !secret.trim()) {
      pushToast('danger', 'შეავსე Merchant ID და Secret key')
      return
    }
    setBusy(true)
    const payload: Record<string, string> = { client_secret: secret.trim() }
    if (hasApiKey) payload.api_key = apiKey.trim()
    const { data, error } = await rpc('save_payment_credentials', {
      p_org_id: orgId,
      p_provider: provider,
      p_merchant_id: merchantId.trim(),
      p_secret: payload,
    })
    setBusy(false)
    if (error || data?.error) {
      pushToast('danger', 'შენახვა ვერ მოხერხდა')
      return
    }
    setSecret(''); setApiKey(''); setMerchantId(''); setEditing(false)
    pushToast('success', `${provider.toUpperCase()} დაკავშირდა ✅`)
    onChanged()
  }

  const toggle = async (active: boolean) => {
    const { error } = await rpc('set_payment_provider_active', {
      p_org_id: orgId, p_provider: provider, p_active: active,
    })
    if (error) { pushToast('danger', 'ვერ შეიცვალა'); return }
    onChanged()
  }

  const remove = async () => {
    if (!confirm(`გნებავთ ${provider.toUpperCase()}-ის გათიშვა?`)) return
    setBusy(true)
    const { error } = await rpc('delete_payment_credentials', { p_org_id: orgId, p_provider: provider })
    setBusy(false)
    if (error) { pushToast('danger', 'ვერ წაიშალა'); return }
    pushToast('info', `${provider.toUpperCase()} გაითიშა`)
    onChanged()
  }

  return (
    <div className="nm-inset rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="nm-raised flex size-9 items-center justify-center rounded-xl">
            <CreditCard className="size-4 text-primary" />
          </div>
          <p className="text-sm font-extrabold">{name}</p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ color: 'var(--status-free)', background: 'color-mix(in oklch, var(--status-free) 14%, transparent)' }}>
            <ShieldCheck className="size-3" /> დაკავშირებულია
          </span>
        ) : (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-muted-foreground nm-raised">
            არ არის
          </span>
        )}
      </div>

      {connected && !editing ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Merchant ID: <span className="font-mono font-bold text-foreground">{existing?.merchant_id ?? '—'}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggle(!existing?.is_active)}
              className={cn('nm-btn rounded-xl px-3 py-2 text-xs font-bold',
                existing?.is_active ? 'text-[var(--status-free)]' : 'text-muted-foreground')}
            >
              {existing?.is_active ? 'აქტიური' : 'გათიშული'}
            </button>
            <button onClick={() => setEditing(true)} className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-primary">
              გასაღების შეცვლა
            </button>
            <button onClick={remove} disabled={busy} className="nm-btn ml-auto flex size-9 items-center justify-center rounded-xl text-[var(--status-expired)]" title="გათიშვა">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Merchant / Client ID</span>
            <input
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="მაგ. 01019..."
              className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono font-bold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="size-3" /> Secret key {connected ? '(ახალი)' : ''}
            </span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••••••••••"
              className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none placeholder:text-muted-foreground"
            />
          </label>
          {hasApiKey && (
            <label className="block">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="size-3" /> API key
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••"
                className="nm-inset mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none placeholder:text-muted-foreground"
              />
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="nm-daylight flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-60">
              <Save className="size-4" /> {connected ? 'განახლება' : 'დაკავშირება'}
            </button>
            {editing && (
              <button onClick={() => { setEditing(false); setSecret(''); setApiKey(''); setMerchantId('') }}
                className="nm-btn flex size-10 items-center justify-center rounded-xl text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function PaymentSettings() {
  const { currentOrgId, currentRole, isPlatformAdmin } = useOrg()
  const [settings, setSettings] = useState<PaymentSetting[]>([])
  const [loaded, setLoaded] = useState(false)

  const canManage = isPlatformAdmin || ['owner', 'admin'].includes(currentRole ?? '')

  const load = useCallback(async () => {
    if (!currentOrgId) return
    const { data, error } = await rpc('get_payment_settings', { p_org_id: currentOrgId })
    if (!error && Array.isArray(data)) setSettings(data as PaymentSetting[])
    setLoaded(true)
  }, [currentOrgId])

  useEffect(() => { if (canManage) load() }, [canManage, load])

  if (!canManage || !currentOrgId) return null

  const byProvider = (p: 'bog' | 'tbc') => settings.find((s) => s.provider === p)

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <CreditCard className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">ონლაინ გადახდები</h2>
          <p className="text-xs text-muted-foreground">
            დააკავშირე შენი TBC / BOG merchant account — ონლაინ ჯავშნის თანხა პირდაპირ შენს ანგარიშზე ჩაირიცხება.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.key}
            provider={p.key}
            name={p.name}
            hasApiKey={p.hasApiKey}
            existing={byProvider(p.key)}
            orgId={currentOrgId}
            onChanged={load}
          />
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-xs font-semibold"
        style={{ color: 'var(--muted-foreground)', background: 'color-mix(in oklch, var(--primary) 7%, transparent)' }}>
        <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>
          გასაღებები ინახება დაშიფრულად და არასდროს ჩანს ხელახლა. კავშირის ტესტი და ცოცხალი გადახდა
          გააქტიურდება checkout-ის ჩართვისას (მალე). {loaded ? '' : '…'}
        </span>
      </div>
    </section>
  )
}
