// crypto-pay — NOWPayments crypto checkout (Phase 1: platform SUBSCRIPTION self-pay).
// Two paths in one function (deployed --no-verify-jwt so the IPN webhook can reach it):
//   • create_subscription (browser, authenticated): the org admin starts a crypto payment
//     for their subscription → we call NOWPayments, store a crypto_payments row, and return
//     the deposit address + amount for the UI to show as a QR.
//   • IPN webhook (NOWPayments → us, no JWT): verified by HMAC-SHA512 over the sorted JSON
//     body using the IPN secret; on a paid status we idempotently extend the org's period
//     via crypto_fulfill_subscription (service role).
// Secrets (Supabase edge secrets): NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, GEL_USD_RATE.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const NP_API = 'https://api.nowpayments.io/v1'
const ENV = (k: string) => Deno.env.get(k) ?? ''

// recursive alphabetical key-sort, then stringify — NOWPayments' IPN signing scheme
function sortKeys(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(sortKeys)
  if (o && typeof o === 'object') {
    return Object.keys(o as Record<string, unknown>).sort().reduce((a, k) => {
      a[k] = sortKeys((o as Record<string, unknown>)[k]); return a
    }, {} as Record<string, unknown>)
  }
  return o
}
async function hmacSha512Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const svc = () => createClient(ENV('SUPABASE_URL'), ENV('SUPABASE_SERVICE_ROLE_KEY'))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const sig = req.headers.get('x-nowpayments-sig')

  // ---- IPN webhook (NOWPayments → us) ----
  if (sig) {
    const raw = await req.text()
    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return json({ error: 'bad_json' }, 400) }
    const expect = await hmacSha512Hex(ENV('NOWPAYMENTS_IPN_SECRET'), JSON.stringify(sortKeys(body)))
    if (expect !== sig) return json({ error: 'bad_signature' }, 401)

    const npId = String(body.payment_id ?? '')
    const status = String(body.payment_status ?? '')
    if (!npId) return json({ error: 'no_payment_id' }, 400)
    const db = svc()
    await db.from('crypto_payments').update({ status, updated_at: new Date().toISOString() }).eq('np_payment_id', npId)
    // fulfill only on a settled status (idempotent on the DB side)
    if (status === 'finished' || status === 'confirmed') {
      const { data } = await db.rpc('crypto_fulfill_subscription', { p_np_payment_id: npId })
      return json({ ok: true, fulfilled: data })
    }
    return json({ ok: true, status })
  }

  // ---- create_subscription (browser, authenticated) ----
  let payload: { action?: string; org_id?: string; months?: number; pay_currency?: string }
  try { payload = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  if (payload.action !== 'create_subscription') return json({ error: 'bad_action' }, 400)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth) return json({ error: 'unauthorized' }, 401)
  const caller = createClient(ENV('SUPABASE_URL'), ENV('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data: user } = await caller.auth.getUser(auth.replace('Bearer ', ''))
  if (!user?.user) return json({ error: 'unauthorized' }, 401)

  const orgId = String(payload.org_id ?? '')
  const months = Math.min(36, Math.max(1, Number(payload.months ?? 1)))
  const payCur = String(payload.pay_currency ?? 'btc').toLowerCase()
  if (!orgId) return json({ error: 'no_org' }, 400)

  // caller must be an admin of this org (RLS-bound check via their JWT)
  const { data: isAdmin } = await caller.rpc('is_org_admin', { p_org: orgId })
  if (isAdmin !== true) return json({ error: 'forbidden' }, 403)

  // GEL price for the plan × months → USD (NOWPayments has no GEL); store both
  const db = svc()
  const { data: org } = await db.from('organizations').select('plan').eq('id', orgId).maybeSingle()
  const { data: priceGel } = await db.rpc('plan_monthly_price', { p_plan: (org as { plan?: string } | null)?.plan ?? 'pro' })
  const gel = Number(priceGel ?? 0) * months
  if (!(gel > 0)) return json({ error: 'nothing_to_pay' }, 400)
  const rate = Number(ENV('GEL_USD_RATE') || '2.7')
  const usd = Math.round((gel / rate) * 100) / 100
  const reference = `sub:${orgId}:${months}:${Date.now()}`

  const npRes = await fetch(`${NP_API}/payment`, {
    method: 'POST',
    headers: { 'x-api-key': ENV('NOWPAYMENTS_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: usd, price_currency: 'usd', pay_currency: payCur,
      order_id: reference, order_description: `Martelounge subscription · ${months} mo`,
      ipn_callback_url: `${ENV('SUPABASE_URL')}/functions/v1/crypto-pay`,
    }),
  })
  const np = await npRes.json().catch(() => ({}))
  if (!npRes.ok || !np.payment_id) {
    return json({ error: 'nowpayments_error', detail: np?.message ?? `http_${npRes.status}` }, 502)
  }

  await db.from('crypto_payments').insert({
    np_payment_id: String(np.payment_id), order_type: 'subscription', org_id: orgId,
    reference, months, price_amount: gel, price_usd: usd,
    pay_currency: np.pay_currency ?? payCur, pay_amount: np.pay_amount ?? null,
    pay_address: np.pay_address ?? null, status: np.payment_status ?? 'waiting',
  })

  return json({
    ok: true, payment_id: np.payment_id, pay_address: np.pay_address,
    pay_amount: np.pay_amount, pay_currency: np.pay_currency ?? payCur,
    price_gel: gel, price_usd: usd, months,
  })
})
