'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, Copy, Check, Trash2, X, Cpu, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'
import { Modal } from './modal'

// api_keys RPCs (migration 0091) aren't in the generated DB types until gen-types
// re-runs post-deploy, so go through a loose wrapper (same pattern as the portal).
const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

// Phase-1 scope vocabulary — stored on the key now, enforced by the Phase-2 gateway.
const SCOPES: { key: string; label: string; hint: string }[] = [
  { key: 'read:sessions', label: 'სესიების კითხვა', hint: 'მიმდინარე/წარსული სესიები' },
  { key: 'read:sales', label: 'გაყიდვების კითხვა', hint: 'ბარი/POS გაყიდვები' },
  { key: 'read:bookings', label: 'ჯავშნების კითხვა', hint: 'ონლაინ ჯავშნები' },
  { key: 'read:analytics', label: 'ანალიტიკის კითხვა', hint: 'შემოსავალი, დატვირთვა' },
  { key: 'write:bookings', label: 'ჯავშნის შექმნა', hint: 'გარე საიტიდან დაჯავშნა' },
  { key: 'write:orders', label: 'შეკვეთის შექმნა', hint: 'POS/ინტეგრაცია' },
  { key: 'device:hardware', label: '🔌 მოწყობილობა (ESP32/Pi)', hint: 'ჩართვა/გამორთვა + სტატუსი' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ka-GE', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function statusOf(k: ApiKey): { label: string; cls: string } {
  if (k.revoked_at) return { label: 'გაუქმებული', cls: 'text-muted-foreground line-through' }
  if (k.expires_at && new Date(k.expires_at) < new Date())
    return { label: 'ვადაგასული', cls: 'text-[var(--status-expired)]' }
  return { label: 'აქტიური', cls: 'text-[var(--status-free)]' }
}

/**
 * Reusable API-key manager. `platform` => God-Mode (org_id NULL, platform-admin gated);
 * otherwise it manages the current org's keys (owner/admin only).
 */
export function ApiKeysPanel({ platform = false }: { platform?: boolean }) {
  const { currentOrgId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const orgId = platform ? null : currentOrgId

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['read:sessions'])
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null) // raw key, shown ONCE
  const [copied, setCopied] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!platform && !orgId) return
    const { data, error } = await sb.rpc('list_api_keys', { p_org_id: orgId })
    if (error) return
    setKeys(Array.isArray(data) ? (data as ApiKey[]) : [])
  }, [platform, orgId])

  useEffect(() => { load() }, [load])

  // org mode is owner/admin only; platform mode is gated by its host (God Mode).
  if (!platform && currentRole !== 'owner' && currentRole !== 'admin') return null

  const toggleScope = (k: string) =>
    setScopes((prev) => (prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]))

  const generate = async () => {
    if (busy) return
    if (scopes.length === 0) { pushToast('warning', 'აირჩიე მინიმუმ ერთი უფლება'); return }
    setBusy(true)
    const { data, error } = await sb.rpc('create_api_key', {
      p_name: name.trim() || 'key',
      p_scopes: scopes,
      p_org_id: orgId,
      p_expires_at: null,
    })
    setBusy(false)
    if (error || data?.error) {
      pushToast('danger', data?.error === 'too_many_keys'
        ? 'გასაღებების ლიმიტი ამოიწურა (20). ჯერ გააუქმე ძველი.'
        : 'ვერ შეიქმნა. სცადე თავიდან.')
      return
    }
    setCreated(data.key)
    setOpen(false)
    setName('')
    setScopes(['read:sessions'])
    load()
  }

  const revoke = async (id: string) => {
    setConfirmId(null)
    const { error } = await sb.rpc('revoke_api_key', { p_id: id })
    if (error) { pushToast('danger', 'ვერ გაუქმდა'); return }
    pushToast('success', 'გასაღები გაუქმდა')
    load()
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      pushToast('warning', 'კოპირება ვერ მოხერხდა — მონიშნე ხელით')
    }
  }

  return (
    <section className="nm-raised rounded-3xl p-6 lg:col-span-2">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
            <KeyRound className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              {platform ? 'პლატფორმის API გასაღებები' : 'API გასაღებები'}
            </h2>
            <p className="text-xs text-muted-foreground text-pretty">
              {platform
                ? 'God Mode — ყველა tenant-ზე წვდომა (მეტრიკა, სკრიპტები, backup).'
                : 'დააკავშირე მოწყობილობა, საიტი ან ინტეგრაცია (ESP32/Pi, ბუღალტერია, webhooks).'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setName(''); setScopes(['read:sessions']); setOpen(true) }}
          className="nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">გასაღების გენერაცია</span>
        </button>
      </div>

      {/* show-once banner: the raw key is never retrievable again */}
      {created && (
        <div className="mb-5 rounded-2xl border border-[var(--status-warning5)]/40 p-4"
             style={{ background: 'color-mix(in oklch, var(--status-warning5) 10%, transparent)' }}>
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--status-warning5)]">
            <ShieldAlert className="size-4" /> დააკოპირე ახლავე — ეს გასაღები მეორედ აღარ გამოჩნდება!
          </div>
          <div className="flex items-center gap-2">
            <code className="nm-inset min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 font-mono text-xs">{created}</code>
            <button
              type="button"
              onClick={() => copy(created)}
              className="nm-btn flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-primary"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'დაკოპირდა' : 'კოპირება'}
            </button>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="nm-btn flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground"
              aria-label="დახურვა"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {keys.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            გასაღები არ არის. დააგენერირე პირველი — და დააკავშირე შენი მოწყობილობა/ინტეგრაცია.
          </p>
        ) : (
          keys.map((k) => {
            const st = statusOf(k)
            const active = !k.revoked_at && !(k.expires_at && new Date(k.expires_at) < new Date())
            return (
              <div key={k.id} className="nm-inset rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {k.scopes.includes('device:hardware') ? <Cpu className="size-4 shrink-0 text-primary" /> : null}
                      <p className="truncate text-sm font-bold">{k.name}</p>
                      <span className={cn('shrink-0 text-[11px] font-bold', st.cls)}>• {st.label}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{k.prefix}••••••••</p>
                  </div>
                  {active && (
                    confirmId === k.id ? (
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => setConfirmId(null)} className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground">არა</button>
                        <button onClick={() => revoke(k.id)} className="nm-btn rounded-xl px-3 py-2 text-xs font-bold text-[var(--status-expired)]">გაუქმება</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(k.id)}
                        className="nm-btn flex size-9 shrink-0 items-center justify-center rounded-xl text-[var(--status-expired)]"
                        title="გაუქმება"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {k.scopes.map((s) => (
                    <span key={s} className="nm-raised-sm rounded-lg px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {SCOPES.find((x) => x.key === s)?.label ?? s}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  შექმნა: {fmtDate(k.created_at)} · ბოლო გამოყენება: {k.last_used_at ? fmtDate(k.last_used_at) : 'არასდროს'}
                </p>
              </div>
            )
          })
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="ახალი API გასაღები">
        <div className="space-y-5">
          <label className="block">
            <span className="text-sm text-muted-foreground">სახელი (რისთვის გამოიყენებ?)</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="მაგ. ბილიარდის Raspberry Pi"
              className="nm-inset mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div>
            <span className="text-sm text-muted-foreground">უფლებები (რა შეეძლოს გასაღებს)</span>
            <div className="mt-2 space-y-2">
              {SCOPES.map((s) => {
                const on = scopes.includes(s.key)
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleScope(s.key)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition',
                      on ? 'nm-daylight' : 'nm-inset',
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-bold', on ? 'text-primary' : 'text-foreground')}>{s.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
                    </span>
                    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', on ? 'bg-primary text-[var(--primary-foreground)]' : 'nm-inset')}>
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="nm-btn flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-muted-foreground"
            >
              გაუქმება
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="nm-daylight flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-primary disabled:opacity-50"
            >
              {busy ? '...' : 'გენერაცია'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
