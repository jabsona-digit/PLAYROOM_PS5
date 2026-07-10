// bank-pay — TBC/BOG online checkout (Phase 2: marketplace BOOKING prepay).
// Ported from the production-proven Kale-group payment service; mirrors the
// crypto-pay engine shape (create → ledger row → bank webhook → verify →
// idempotent fulfill via bank_fulfill_booking).
//
// Paths (one function, deployed --no-verify-jwt so bank callbacks reach it):
//   • POST {action:'create_booking_payment', booking_id, provider?} — starts a
//     payment for a pending booking using the VENUE OWNER's own merchant creds
//     (0058 Vault, read via get_bank_credentials). No creds + org.bank_test_mode
//     → MOCK mode: the booking is marked paid with is_mock=true (test orgs only).
//   • POST ?cb=bog — BOG callback, verified by RSA-SHA256 over the raw body with
//     BOG's published public key (callback-signature header).
//   • POST ?cb=tbc — TBC callback; we DON'T trust the body — we re-fetch the
//     payment from TBC's API with the org's creds and act on TBC's answer
//     (stronger than Kale's IP allowlist, and serverless-friendly).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ENV = (k: string) => Deno.env.get(k) ?? ''
const svc = () => createClient(ENV('SUPABASE_URL'), ENV('SUPABASE_SERVICE_ROLE_KEY'))

const PLAY_URL = 'https://play.martelounge.ge'
const BOG_OAUTH = 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token'
const BOG_ORDERS = 'https://api.bog.ge/payments/v1/ecommerce/orders'
const TBC_API = 'https://api.tbcbank.ge/v1/tpay'

// BOG's published callback-signing public key (SHA256withRSA) — same key for all
// merchants, from the official BOG API docs (verbatim from the Kale-group port).
const BOG_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0
Q1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTr
rTYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvh
xtcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/
g4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhP
nPwIDAQAB
-----END PUBLIC KEY-----`

async function importBogKey(): Promise<CryptoKey> {
  const b64 = BOG_PUBLIC_KEY_PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
}

async function verifyBogSignature(rawBody: string, sigB64: string): Promise<boolean> {
  try {
    const key = await importBogKey()
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0))
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(rawBody))
  } catch {
    return false
  }
}

type Creds = { ok?: boolean; error?: string; merchant_id?: string; secret?: { client_secret?: string; api_key?: string } }

async function getCreds(db: ReturnType<typeof svc>, orgId: string, provider: string): Promise<Creds> {
  const { data } = await db.rpc('get_bank_credentials', { p_org: orgId, p_provider: provider })
  return (data ?? { error: 'not_configured' }) as Creds
}

// ── bank clients (per-org creds — no global token cache) ──────────────────────
async function bogToken(creds: Creds): Promise<string> {
  const res = await fetch(BOG_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.merchant_id ?? '',
      client_secret: creds.secret?.client_secret ?? '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.access_token) throw new Error('bog_token_failed')
  return data.access_token
}

async function tbcToken(creds: Creds): Promise<string> {
  const res = await fetch(`${TBC_API}/access-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: creds.secret?.api_key ?? '' },
    body: new URLSearchParams({
      client_id: creds.merchant_id ?? '',
      client_secret: creds.secret?.client_secret ?? '',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.access_token) throw new Error('tbc_token_failed')
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const db = svc()
  const cb = new URL(req.url).searchParams.get('cb')

  // ── BOG callback ──────────────────────────────────────────────────────────
  if (cb === 'bog') {
    const raw = await req.text()
    const sig = req.headers.get('callback-signature') ?? ''
    if (!sig || !(await verifyBogSignature(raw, sig))) return json({ error: 'bad_signature' }, 401)

    let body: Record<string, unknown>
    try { body = JSON.parse(raw) } catch { return json({ error: 'bad_json' }, 400) }
    const order = (body.body ?? body) as Record<string, unknown>
    const externalId = String(order.order_id ?? '')
    const statusKey = String((order.order_status as Record<string, unknown> | undefined)?.key ?? order.status ?? '')
    if (!externalId) return json({ error: 'no_order_id' }, 400)

    const { data: pay } = await db.from('bank_payments').select('id,status')
      .eq('external_id', externalId).eq('provider', 'bog').maybeSingle()
    if (!pay) return json({ ok: true, unknown_payment: true })

    if (statusKey === 'completed') {
      const { data } = await db.rpc('bank_fulfill_booking', { p_payment_id: pay.id })
      return json({ ok: true, fulfilled: data })
    }
    if (['rejected', 'expired', 'failed'].includes(statusKey)) {
      await db.from('bank_payments').update({ status: 'failed', raw: order, updated_at: new Date().toISOString() })
        .eq('id', pay.id).neq('status', 'paid')
    }
    return json({ ok: true, status: statusKey })
  }

  // ── TBC callback (re-verify against TBC's API — never trust the body) ────
  if (cb === 'tbc') {
    let payId = ''
    try {
      const ct = req.headers.get('content-type') ?? ''
      if (ct.includes('json')) {
        const b = await req.json()
        payId = String(b.PaymentId ?? b.payId ?? b.payment_id ?? '')
      } else {
        const form = await req.formData().catch(() => null)
        payId = String(form?.get('PaymentId') ?? '')
      }
    } catch { /* fall through */ }
    if (!payId) return json({ error: 'no_payment_id' }, 400)

    const { data: pay } = await db.from('bank_payments').select('id,org_id,status')
      .eq('external_id', payId).eq('provider', 'tbc').maybeSingle()
    if (!pay) return json({ ok: true, unknown_payment: true })
    if (pay.status === 'paid') return json({ ok: true, already: true })

    const creds = await getCreds(db, pay.org_id, 'tbc')
    if (!creds.ok) return json({ error: 'creds_missing' }, 500)
    const token = await tbcToken(creds)
    const res = await fetch(`${TBC_API}/payments/${payId}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: creds.secret?.api_key ?? '' },
    })
    const detail = await res.json().catch(() => ({}))
    const st = String(detail.status ?? '')

    if (st === 'Succeeded') {
      const { data } = await db.rpc('bank_fulfill_booking', { p_payment_id: pay.id })
      return json({ ok: true, fulfilled: data })
    }
    if (['Failed', 'Expired', 'Cancelled'].includes(st)) {
      await db.from('bank_payments').update({ status: 'failed', raw: detail, updated_at: new Date().toISOString() })
        .eq('id', pay.id).neq('status', 'paid')
    }
    return json({ ok: true, status: st })
  }

  // ── create_booking_payment ────────────────────────────────────────────────
  let payload: { action?: string; booking_id?: string; provider?: string }
  try { payload = await req.json() } catch { return json({ error: 'bad_json' }, 400) }
  if (payload.action !== 'create_booking_payment') return json({ error: 'bad_action' }, 400)

  const bookingId = String(payload.booking_id ?? '')
  if (!bookingId) return json({ error: 'no_booking' }, 400)

  const { data: booking } = await db.from('marketplace_bookings')
    .select('id,org_id,venue_id,total_amount,payment_status,status')
    .eq('id', bookingId).maybeSingle()
  if (!booking) return json({ error: 'booking_not_found' }, 404)
  if (booking.status === 'cancelled') return json({ error: 'booking_cancelled' }, 409)
  if (booking.payment_status === 'paid') return json({ error: 'already_paid' }, 409)
  const amount = Number(booking.total_amount ?? 0)
  if (!(amount > 0)) return json({ error: 'nothing_to_pay' }, 400)

  // pick the provider: explicit, else whichever the org has active (bog first)
  const wanted = payload.provider && ['bog', 'tbc'].includes(payload.provider) ? [payload.provider] : ['bog', 'tbc']
  let provider = ''
  let creds: Creds = { error: 'not_configured' }
  for (const p of wanted) {
    const c = await getCreds(db, booking.org_id, p)
    if (c.ok) { provider = p; creds = c; break }
  }

  // MOCK mode — only for orgs that explicitly opted into test mode
  if (!provider) {
    const { data: org } = await db.from('organizations').select('bank_test_mode').eq('id', booking.org_id).maybeSingle()
    if (!org?.bank_test_mode) return json({ error: 'provider_not_configured' }, 400)

    const { data: row, error: insErr } = await db.from('bank_payments').insert({
      provider: 'mock', order_type: 'booking', org_id: booking.org_id, venue_id: booking.venue_id,
      booking_id: booking.id, amount, is_mock: true, status: 'pending',
    }).select('id').single()
    if (insErr || !row) return json({ error: 'ledger_insert_failed' }, 500)

    const { data: ful } = await db.rpc('bank_fulfill_booking', { p_payment_id: row.id })
    return json({ ok: true, mock: true, paid: true, fulfilled: ful })
  }

  const callbackBase = `${ENV('SUPABASE_URL')}/functions/v1/bank-pay`

  if (provider === 'bog') {
    const token = await bogToken(creds)
    const res = await fetch(BOG_ORDERS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_url: `${callbackBase}?cb=bog`,
        external_order_id: booking.id,
        purchase_units: {
          currency: 'GEL',
          total_amount: amount,
          basket: [{ quantity: 1, unit_price: amount, product_id: booking.id }],
        },
        redirect_urls: {
          success: `${PLAY_URL}/pay/result?booking=${booking.id}&status=success`,
          fail: `${PLAY_URL}/pay/result?booking=${booking.id}&status=fail`,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.id) return json({ error: 'bog_order_failed', detail: data?.message ?? `http_${res.status}` }, 502)

    await db.from('bank_payments').insert({
      provider: 'bog', external_id: String(data.id), order_type: 'booking',
      org_id: booking.org_id, venue_id: booking.venue_id, booking_id: booking.id,
      amount, status: 'pending', redirect_url: data._links?.redirect?.href ?? null, raw: data,
    })
    return json({ ok: true, provider: 'bog', payment_id: data.id, redirect_url: data._links?.redirect?.href })
  }

  // TBC
  const token = await tbcToken(creds)
  const res = await fetch(`${TBC_API}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: creds.secret?.api_key ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency: 'GEL', total: amount, subTotal: amount, tax: 0, shipping: 0 },
      returnurl: `${PLAY_URL}/pay/result?booking=${booking.id}&status=success`,
      callbackUrl: `${callbackBase}?cb=tbc`,
      extra: booking.id,
      description: `Martelounge booking ${booking.id.slice(0, 8)}`,
      language: 'KA',
    }),
  })
  const data = await res.json().catch(() => ({}))
  const payId = String(data.payId ?? '')
  if (!res.ok || !payId) return json({ error: 'tbc_payment_failed', detail: data?.message ?? `http_${res.status}` }, 502)

  const approval = Array.isArray(data.links)
    ? (data.links.find((l: { rel?: string }) => l.rel === 'approval_url')?.uri ?? data.links[0]?.uri)
    : undefined

  await db.from('bank_payments').insert({
    provider: 'tbc', external_id: payId, order_type: 'booking',
    org_id: booking.org_id, venue_id: booking.venue_id, booking_id: booking.id,
    amount, status: 'pending', redirect_url: approval ?? null, raw: data,
  })
  return json({ ok: true, provider: 'tbc', payment_id: payId, redirect_url: approval })
})
