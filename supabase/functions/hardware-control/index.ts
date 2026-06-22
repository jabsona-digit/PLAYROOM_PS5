// hardware-control — executes a CLOUD power command for a console (Shelly Cloud).
//
// Why an edge function (vs the RPC): cloud devices are reached through the
// vendor's cloud (cloud→cloud), which Postgres shouldn't do. LAN relays go via
// the local agent instead; manual/agent consoles are handled by set_console_power
// — this function only runs for control_mode='cloud'.
//
// Security: the caller's JWT authorises membership (reading console_hardware is
// RLS-gated to org members). The secret auth_key is read with the SERVICE ROLE
// via get_hardware_secret (granted to service_role only) so members can never
// see it. The outcome is written to power_events via log_power_event.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Fire-and-forget error capture (0128): a relay-control failure is wedge-critical, so surface
// it to edge_error_log (in addition to power_events). NEVER throws / never blocks.
function logEdgeError(client: any, fn: string, message: string, context: Record<string, unknown> = {}) {
  try {
    const p = Promise.resolve(
      client.rpc('log_edge_error', { p_fn: fn, p_message: String(message ?? '').slice(0, 2000), p_context: context }),
    ).then(() => {}, () => {})
    // @ts-ignore Supabase Edge keeps the isolate alive to finish the insert
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) (EdgeRuntime as any).waitUntil(p)
  } catch { /* logging must never break the function */ }
}

interface Body {
  console_id: number
  action: 'on' | 'off' | 'force_on' | 'force_off'
  session_id?: string | null
  triggered_by?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // caller context — RLS applies (membership check is implicit in the reads)
  const user = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  // elevated context — ONLY to read the Vault secret
  const svc = createClient(url, serviceKey)

  let body: Body
  try { body = await req.json() } catch { return json({ error: 'invalid body' }, 400) }
  if (!body.console_id || !['on', 'off', 'force_on', 'force_off'].includes(body.action)) {
    return json({ error: 'bad_args' }, 400)
  }
  const triggeredBy = body.triggered_by ?? (body.action.startsWith('force') ? 'admin_force' : 'session_start')
  const turn: 'on' | 'off' = body.action === 'on' || body.action === 'force_on' ? 'on' : 'off'

  // 1. hardware config (RLS-gated → member only). Not configured / not cloud → skip.
  const { data: hw, error: hwErr } = await user
    .from('console_hardware')
    .select('control_mode, driver, config, venue_id')
    .eq('console_id', body.console_id)
    .maybeSingle()
  if (hwErr) return json({ error: 'forbidden' }, 403)
  if (!hw || hw.control_mode !== 'cloud') return json({ ok: true, skipped: true })

  const provider = hw.driver === 'tuya' ? 'tuya' : 'shelly'
  const cfg = (hw.config ?? {}) as { device_id?: string; channel?: number }

  let success = false
  let errorMsg: string | null = null
  try {
    // 2. secret (service-role only)
    const { data: cred, error: credErr } = await svc.rpc('get_hardware_secret', {
      p_venue_id: hw.venue_id, p_provider: provider,
    })
    if (credErr) throw new Error(credErr.message)
    if (!cred?.server || !cred?.auth_key) throw new Error('no_credentials')

    // 3. device call
    if (hw.driver === 'shelly_cloud') {
      const form = new URLSearchParams({
        id: String(cfg.device_id ?? ''),
        channel: String(cfg.channel ?? 0),
        turn,
        auth_key: cred.auth_key,
      })
      const res = await fetch(`https://${cred.server}/device/relay/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      const txt = await res.text()
      let isok = res.ok
      try { isok = (JSON.parse(txt)?.isok ?? res.ok) === true } catch { /* keep res.ok */ }
      if (!isok) throw new Error(`shelly: ${txt.slice(0, 140)}`)
      success = true
    } else {
      throw new Error(`driver_unsupported: ${hw.driver}`)
    }
  } catch (e) {
    errorMsg = (e as Error).message
    logEdgeError(svc, 'hardware-control', errorMsg, { console_id: body.console_id, action: body.action })
  }

  // 4. audit (as the caller → records operator_id; member-gated RPC)
  try {
    await user.rpc('log_power_event', {
      p_console_id: body.console_id,
      p_action: body.action,
      p_triggered_by: triggeredBy,
      p_session_id: body.session_id ?? null,
      p_success: success,
      p_error: errorMsg,
    })
  } catch (_) { /* best-effort audit */ }

  return json({ ok: success, error: errorMsg })
})
