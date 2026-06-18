// api-gateway — public programmatic + device API for Martelounge.
//
// Auth: `Authorization: Bearer mk_...` (an API key from migration 0091), NOT a
// Supabase JWT. Deployed with --no-verify-jwt so external devices (a Raspberry Pi
// or ESP32 in the venue) can call it with ONLY their key. We authenticate the key
// via verify_api_key (service role), enforce the key's scopes, then dispatch to the
// api_* SECURITY DEFINER functions (migration 0092). No user context anywhere.
//
// Routes (all under .../functions/v1/api-gateway):
//   GET  /v1/ping            -> any valid key: { org_id, scopes }
//   GET  /v1/devices         -> device:hardware | read:sessions: relay desired-state poll
//   POST /v1/devices/state   -> device:hardware: agent acks actual relay state
//   GET  /v1/sessions?limit= -> read:sessions
//   GET  /v1/analytics       -> read:analytics: today's headline numbers

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const url = new URL(req.url)
  const path = (url.pathname.split('/api-gateway')[1] || '/').replace(/\/+$/, '') || '/'

  // --- authenticate the API key (NOT a JWT) ---
  const auth = req.headers.get('Authorization') ?? ''
  const key = auth.replace(/^Bearer\s+/i, '').trim()
  if (!key.startsWith('mk_')) return json({ error: 'missing_api_key' }, 401)

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: v, error: vErr } = await svc.rpc('verify_api_key', { p_key: key })
  if (vErr || !v?.valid) return json({ error: 'invalid_api_key' }, 401)

  const orgId: string | null = v.org_id
  const scopes: string[] = Array.isArray(v.scopes) ? v.scopes : []
  const has = (...needed: string[]) => needed.some((s) => scopes.includes(s))
  // throws a Response (caught below) when the key lacks every listed scope
  const need = (...s: string[]) => {
    if (!has(...s)) throw json({ error: 'insufficient_scope', need: s }, 403)
  }

  try {
    // health / key introspection — any valid key
    if (req.method === 'GET' && (path === '/' || path === '/v1/ping')) {
      return json({ ok: true, org_id: orgId, scopes, platform: orgId === null })
    }

    // org-scoped routes need an org key (platform keys get their own routes later)
    if (orgId === null) return json({ error: 'org_key_required' }, 400)

    // GET /v1/devices — relay desired-state poll (Raspberry Pi / ESP32)
    if (req.method === 'GET' && path === '/v1/devices') {
      need('device:hardware', 'read:sessions')
      const { data, error } = await svc.rpc('api_device_list', { p_org_id: orgId })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, devices: data })
    }

    // POST /v1/devices/state — agent acknowledges the actual relay state
    if (req.method === 'POST' && path === '/v1/devices/state') {
      need('device:hardware')
      let body: { console_id?: number; state?: string; success?: boolean; error?: string }
      try { body = await req.json() } catch { return json({ error: 'invalid_body' }, 400) }
      if (!body?.console_id || (body.state !== 'on' && body.state !== 'off')) {
        return json({ error: 'bad_args', hint: '{ console_id, state: "on"|"off" }' }, 400)
      }
      const { data, error } = await svc.rpc('api_device_report', {
        p_org_id: orgId,
        p_console_id: Number(body.console_id),
        p_state: body.state,
        p_success: body.success ?? true,
        p_error: body.error ?? null,
      })
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    // GET /v1/sessions?limit=
    if (req.method === 'GET' && path === '/v1/sessions') {
      need('read:sessions')
      const limit = Number(url.searchParams.get('limit') ?? '50')
      const { data, error } = await svc.rpc('api_list_sessions', { p_org_id: orgId, p_limit: limit })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, sessions: data })
    }

    // GET /v1/analytics
    if (req.method === 'GET' && path === '/v1/analytics') {
      need('read:analytics')
      const { data, error } = await svc.rpc('api_analytics_summary', { p_org_id: orgId })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, analytics: data })
    }

    return json({ error: 'not_found', path }, 404)
  } catch (e) {
    if (e instanceof Response) return e
    return json({ error: 'server_error', detail: (e as Error).message }, 500)
  }
})
