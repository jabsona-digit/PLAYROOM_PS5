'use client'

import { useCallback, useEffect, useState } from 'react'
import { Send, Copy, Check, RefreshCw } from 'lucide-react'
import { useOrg } from '@/lib/org'
import { usePlayroom } from '@/lib/store'
import { supabase } from '@/lib/supabase/client'

// telegram_* RPCs ship in migration 0100; not in generated types yet → loose wrapper.
const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

export function TelegramSettings() {
  const { currentOrgId, currentRole } = useOrg()
  const { pushToast } = usePlayroom()
  const [linked, setLinked] = useState<boolean | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!currentOrgId) return
    const { data } = await sb.rpc('telegram_link_status', { p_org_id: currentOrgId })
    setLinked(!!data?.linked)
  }, [currentOrgId])

  useEffect(() => { load() }, [load])

  if (currentRole !== 'owner' && currentRole !== 'admin') return null

  const generate = async () => {
    if (!currentOrgId || busy) return
    setBusy(true)
    const { data, error } = await sb.rpc('create_telegram_link_code', { p_org_id: currentOrgId })
    setBusy(false)
    if (error || !data?.ok) { pushToast('danger', 'ვერ მოხერხდა — სცადე თავიდან'); return }
    setCode(data.code)
  }

  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* */ }
  }

  return (
    <section className="nm-raised rounded-3xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="nm-inset flex size-11 items-center justify-center rounded-2xl">
          <Send className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Telegram ბოტი</h2>
          <p className="text-xs text-muted-foreground text-pretty">
            მიიღე შემოსავალი/სტატუსი პირდაპირ Telegram-ში — /revenue, /consoles.
          </p>
        </div>
      </div>

      {/* status */}
      <div className="nm-inset mb-4 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="text-sm font-bold">
          {linked === null ? '…' : linked
            ? <span className="text-[var(--status-free)]">✅ დაკავშირებულია</span>
            : <span className="text-muted-foreground">⚪ არ არის დაკავშირებული</span>}
        </span>
        <button onClick={load} className="nm-btn flex size-8 items-center justify-center rounded-xl text-muted-foreground" title="განახლება">
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* open the shared bot directly — owner doesn't create their own */}
      <a
        href="https://t.me/playmarteloungebot"
        target="_blank"
        rel="noopener noreferrer"
        className="nm-btn mb-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-primary"
      >
        <Send className="size-4" /> ბოტის გახსნა — @playmarteloungebot
      </a>

      {/* generated code */}
      {code && (
        <div className="mb-4 rounded-2xl border border-[var(--status-warning5)]/40 p-4"
             style={{ background: 'color-mix(in oklch, var(--status-warning5) 10%, transparent)' }}>
          <p className="mb-2 text-sm font-bold">გაუგზავნე <span className="text-primary">@playmarteloungebot</span>-ს (30 წუთი მოქმედებს):</p>
          <div className="flex items-center gap-2">
            <code className="nm-inset flex-1 rounded-xl px-3 py-2.5 text-center font-mono text-base font-black tracking-widest">/link {code}</code>
            <button onClick={() => copy(`/link ${code}`)} className="nm-btn flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-primary">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'დაკოპირდა' : 'კოპირება'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-primary disabled:opacity-50"
      >
        <Send className="size-4" />
        {busy ? '...' : linked ? 'ხელახლა დაკავშირება (კოდი)' : 'დაკავშირების კოდის გენერაცია'}
      </button>

      <ol className="mt-4 space-y-1 text-[11px] text-muted-foreground">
        <li>1. გახსენი ჩვენი ბოტი <span className="text-foreground">@playmarteloungebot</span> (ღილაკით ზემოთ) და დააჭირე Start.</li>
        <li>2. დააჭირე „დაკავშირების კოდის გენერაცია".</li>
        <li>3. გაუგზავნე ბოტს <code className="text-foreground">/link კოდი</code>.</li>
        <li>4. მერე: <code className="text-foreground">/revenue</code> · <code className="text-foreground">/consoles</code></li>
      </ol>
      <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
        ℹ️ ცალკე ბოტის შექმნა <b>არ გჭირდება</b> — ყველა იყენებს ერთსა და იმავე ბოტს, შენი კლუბი მხოლოდ კოდით იბმება.
      </p>
    </section>
  )
}
