'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Bitcoin, Copy, LoaderCircle, CheckCircle2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { usePlayroom } from '@/lib/store'
import { gel } from '@/lib/ui'
import { Modal } from './modal'

// Crypto subscription payment (NOWPayments, migration 0143 + crypto-pay edge fn). The owner
// renews their paid plan in crypto: pick currency + months → we create a NOWPayments payment
// and show the deposit address/QR; the IPN webhook extends the period server-side, and we
// poll crypto_payments.status (RLS-scoped to the org) until it settles.
const MONTHS = [1, 3, 6, 12] as const
const COINS = [
  { c: 'btc', label: 'BTC' },
  { c: 'ltc', label: 'LTC' },
  { c: 'usdttrc20', label: 'USDT' },
] as const

type Created = { payment_id: string; pay_address: string; pay_amount: number; pay_currency: string; price_gel: number; price_usd: number; months: number }

// What we encode INTO the QR. Strict wallet scanners (Binance/Trust) want a proper payment
// payload — for BTC/LTC the BIP-21 URI (auto-fills the amount too); for USDT-TRC20 there is no
// universally-supported token URI, so the bare address is the most compatible. (The white
// quiet-zone via marginSize on the QR itself is what actually lets these scanners lock on.)
function qrPayload(c: Created): string {
  const cur = c.pay_currency.toLowerCase()
  if (cur === 'btc') return `bitcoin:${c.pay_address}?amount=${c.pay_amount}`
  if (cur === 'ltc') return `litecoin:${c.pay_address}?amount=${c.pay_amount}`
  return c.pay_address
}

export function CryptoSubscriptionPay({ orgId, plan, buttonClassName }: { orgId: string | null; plan: string; buttonClassName?: string }) {
  const { pushToast } = usePlayroom()
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState<number>(1)
  const [coin, setCoin] = useState<string>('btc')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [status, setStatus] = useState<string>('waiting')
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  const paid = plan !== 'trial'

  const reset = () => {
    if (poll.current) clearInterval(poll.current)
    poll.current = null
    setCreated(null); setStatus('waiting'); setBusy(false)
  }
  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const startPolling = (npId: string) => {
    poll.current = setInterval(async () => {
      const { data } = await supabase.from('crypto_payments').select('status').eq('np_payment_id', npId).maybeSingle()
      const st = (data as { status?: string } | null)?.status
      if (st) setStatus(st)
      if (st === 'finished' || st === 'confirmed') {
        if (poll.current) clearInterval(poll.current)
        pushToast('success', 'გადახდა დადასტურდა — გამოწერა გაგრძელდა! ✅')
      }
    }, 6000)
  }

  const create = async () => {
    if (!orgId) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('crypto-pay', {
      body: { action: 'create_subscription', org_id: orgId, months, pay_currency: coin },
    })
    setBusy(false)
    if (error || !data?.ok) {
      pushToast('danger', 'ვერ შეიქმნა გადახდა: ' + (data?.detail ?? error?.message ?? 'უცნობი'))
      return
    }
    setCreated(data as Created)
    setStatus('waiting')
    startPolling((data as Created).payment_id)
  }

  const copy = (s: string) => { navigator.clipboard?.writeText(s); pushToast('info', 'მისამართი დაკოპირდა') }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true) }}
        className={buttonClassName ?? 'nm-btn flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-primary self-start'}
      >
        <Bitcoin className="size-4" />
        გადაიხადე კრიპტოთი
      </button>

      <Modal open={open} onClose={() => { setOpen(false); reset() }} title="კრიპტო გადახდა — გამოწერა">
        {!paid ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            ჯერ აირჩიე ფასიანი პლანი (PRO/ENTERPRISE) — შემდეგ შესაძლებელია მისი გაგრძელება კრიპტოთი.
          </p>
        ) : !created ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">ვალუტა</p>
              <div className="flex gap-2">
                {COINS.map((x) => (
                  <button key={x.c} onClick={() => setCoin(x.c)}
                    className={`nm-btn flex-1 rounded-xl py-2.5 text-sm font-bold ${coin === x.c ? 'text-primary nm-inset' : 'text-muted-foreground'}`}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">პერიოდი</p>
              <div className="flex gap-2">
                {MONTHS.map((m) => (
                  <button key={m} onClick={() => setMonths(m)}
                    className={`nm-btn flex-1 rounded-xl py-2.5 text-sm font-bold ${months === m ? 'text-primary nm-inset' : 'text-muted-foreground'}`}>
                    {m} თვე
                  </button>
                ))}
              </div>
            </div>
            <button onClick={create} disabled={busy}
              className="nm-daylight flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-black text-primary disabled:opacity-60">
              {busy ? <LoaderCircle className="size-5 animate-spin" /> : <>გადახდის გენერაცია</>}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">თანხა გამოითვლება მიმდინარე პლანის მიხედვით.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(status === 'finished' || status === 'confirmed') ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="size-14 text-[var(--status-free)]" />
                <p className="text-lg font-extrabold">გადახდა დადასტურდა!</p>
                <p className="text-sm text-muted-foreground">გამოწერა გაგრძელდა {created.months} თვით.</p>
              </div>
            ) : (
              <>
                <div className="nm-inset mx-auto w-fit rounded-3xl bg-white p-4">
                  <QRCodeSVG value={qrPayload(created)} size={220} level="M" marginSize={4} />
                </div>
                <div className="nm-inset rounded-2xl p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">გადასახდელი</span>
                    <span className="font-mono font-extrabold text-primary">{created.pay_amount} {created.pay_currency.toUpperCase()}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>≈ {gel(created.price_gel)} / ${created.price_usd}</span>
                    <span>{created.months} თვე</span>
                  </div>
                </div>
                <button onClick={() => copy(created.pay_address)}
                  className="nm-btn flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-xs">
                  <span className="truncate font-mono">{created.pay_address}</span>
                  <Copy className="size-4 shrink-0 text-primary" />
                </button>
                <p className="flex items-center justify-center gap-2 text-center text-sm font-bold text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> ველოდები გადახდას… ({status})
                </p>
                <p className="text-center text-[11px] text-muted-foreground">გადარიცხე ზუსტი თანხა ამ მისამართზე. დადასტურება ავტომატურია.</p>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
