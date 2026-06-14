// AI Assistant — secure Gemini proxy for the Playroom admin panel.
//
// Security model: every query and action runs through a Supabase client built
// from the *caller's* JWT, so RLS + role checks + tenant suspension all apply.
// The assistant can never do more than the signed-in user could do by hand.
// Platform admins (God Mode) automatically get cross-tenant reach because their
// JWT already satisfies the platform-admin RLS branch. No service_role is used.
//
// Mutating tools never execute on the first pass — the model proposes the action,
// the UI confirms it, and the frontend calls back with `confirmedAction`.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
// Fallback chain — if the primary is overloaded (503) or rate-limited (429,
// per-model on the free tier), the next model serves the request.
const MODELS = [...new Set([GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-2.5-flash-lite'])]

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const READ_TOOLS = new Set([
  'get_overview',
  'list_consoles',
  'list_plans',
  'list_bar_products',
  'list_customers',
  'recent_bar_sales',
  'recent_sessions',
  'list_employees',
  'list_reservations',
  'list_expenses',
  'get_revenue_summary',
])
const WRITE_TOOLS = new Set(['start_session', 'start_open_session', 'end_session', 'create_bar_sale', 'restock_product'])

const toolDeclarations = [
  { name: 'get_overview', description: 'მიმდინარე მდგომარეობა: აქტიური/თავისუფალი კონსოლები, იწურება.', parameters: { type: 'object', properties: {} } },
  { name: 'list_consoles', description: 'კონსოლების სია id-ით, სახელით, სტატუსით და აქტიური სესიით.', parameters: { type: 'object', properties: {} } },
  { name: 'list_plans', description: 'აქტიური ტარიფების სია (id, სახელი, ფასი/სთ, ჯოისტიკები).', parameters: { type: 'object', properties: {} } },
  { name: 'list_bar_products', description: 'ბარის პროდუქტების სია (id, სახელი, ფასი, მარაგი).', parameters: { type: 'object', properties: {} } },
  { name: 'list_customers', description: 'კლიენტების სია (სახელი, ტელეფონი, ქულები, ვიზიტები, დახარჯული). ბოლოს დამატებულები პირველ ადგილზე.', parameters: { type: 'object', properties: {} } },
  { name: 'recent_bar_sales', description: 'ბოლო ბარის გაყიდვები — დრო, თანხა, მეთოდი, ნივთები. პასუხობს "ბოლოს რა გაიყიდა" ტიპის კითხვებზე.', parameters: { type: 'object', properties: {} } },
  { name: 'recent_sessions', description: 'ბოლო დასრულებული სესიები — კლიენტი, თანხა, ხანგრძლივობა, დრო.', parameters: { type: 'object', properties: {} } },
  { name: 'list_employees', description: 'თანამშრომლების სია (სახელი, როლი, აქტიურია თუ არა).', parameters: { type: 'object', properties: {} } },
  { name: 'list_reservations', description: 'ჯავშნები — კლიენტი, დრო, ხანგრძლივობა, სტატუსი.', parameters: { type: 'object', properties: {} } },
  { name: 'list_expenses', description: 'ბოლო ხარჯები — კატეგორია, თანხა, აღწერა, თარიღი.', parameters: { type: 'object', properties: {} } },
  { name: 'get_revenue_summary', description: 'შემოსავალი მოცემულ პერიოდში (სესიები + ბარი). თარიღები: YYYY-MM-DD.', parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
  { name: 'start_session', description: 'ფიქსირებული სესია კონსოლზე — მითითებული ხანგრძლივობით (duration_min). გამოიყენე როცა მომხმარებელი ასახელებს დროს (მაგ "1 საათი"). წინასწარ მოიძიე console_id და plan_id.', parameters: { type: 'object', properties: { console_id: { type: 'integer' }, plan_id: { type: 'integer' }, duration_min: { type: 'integer' }, customer_name: { type: 'string' }, payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] }, bank: { type: 'string', enum: ['TBC', 'BOG'] } }, required: ['console_id', 'plan_id', 'duration_min', 'payment_method'] } },
  { name: 'start_open_session', description: 'მიმდინარე (ღია) სესია — დრო წინ ითვლება, თანხა დასრულებისას ითვლება ნათამაშებ დროზე (5 წთ-მდე დამრგვალებით). გამოიყენე როცა მომხმარებელი არ უთითებს კონკრეტულ ხანგრძლივობას ("ღია", "მიმდინარე", "რამდენსაც ითამაშებს"). ხანგრძლივობა არ სჭირდება. წინასწარ მოიძიე console_id და plan_id.', parameters: { type: 'object', properties: { console_id: { type: 'integer' }, plan_id: { type: 'integer' }, customer_name: { type: 'string' }, payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] }, bank: { type: 'string', enum: ['TBC', 'BOG'] } }, required: ['console_id', 'plan_id', 'payment_method'] } },
  { name: 'end_session', description: 'აქტიური სესიის დასრულება. session_id list_consoles-დან.', parameters: { type: 'object', properties: { session_id: { type: 'string' }, tip: { type: 'number' } }, required: ['session_id'] } },
  { name: 'create_bar_sale', description: 'ბარის გაყიდვა. items:[{product_id,qty}]. product_id list_bar_products-დან.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'integer' }, qty: { type: 'integer' } }, required: ['product_id', 'qty'] } }, payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] }, bank: { type: 'string', enum: ['TBC', 'BOG'] }, tip: { type: 'number' }, session_id: { type: 'string' } }, required: ['items', 'payment_method'] } },
  { name: 'restock_product', description: 'არსებული პროდუქტის მარაგის შევსება — ემატება მიმდინარე მარაგს. მხოლოდ უკვე არსებულ პროდუქტზე მუშაობს, ახალს ვერ ქმნის. product_id მოიძიე list_bar_products-დან.', parameters: { type: 'object', properties: { product_id: { type: 'integer' }, add_qty: { type: 'integer' }, product_name: { type: 'string' } }, required: ['product_id', 'add_qty'] } },
]

async function runTool(
  db: SupabaseClient,
  venueId: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_overview': {
      const { data, error } = await db.from('consoles').select('id, name, status, deleted_at').is('deleted_at', null)
      if (error) throw error
      const active = (data ?? []).filter((c) => c.status === 'active').length
      const expiring = (data ?? []).filter((c) => c.status === 'warning_5' || c.status === 'expired').length
      return { total_consoles: data?.length ?? 0, active, free: (data?.length ?? 0) - active, expiring }
    }
    case 'list_consoles': {
      const { data, error } = await db.from('consoles').select('id, name, slot_number, status, sessions(id, customer_name, ends_at, status)').is('deleted_at', null).order('slot_number')
      if (error) throw error
      return data
    }
    case 'list_plans': {
      const { data, error } = await db.from('pricing_plans').select('id, name, price_per_hour, controllers, is_active').eq('is_active', true)
      if (error) throw error
      return data
    }
    case 'list_bar_products': {
      const { data, error } = await db.from('bar_products').select('id, name, price, stock_quantity, is_active').eq('is_active', true)
      if (error) throw error
      return data
    }
    case 'list_customers': {
      const { data, error } = await db.from('customers').select('name, phone, points, visit_count, total_spent, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      return data
    }
    case 'recent_bar_sales': {
      const { data, error } = await db.from('bar_sales').select('created_at, total, tip_amount, payment_method, bank, customer_name, voided_at, bar_sale_items(name, qty, line_total)').order('created_at', { ascending: false }).limit(15)
      if (error) throw error
      return data
    }
    case 'recent_sessions': {
      const { data, error } = await db.from('sessions').select('customer_name, price_total, tip_amount, duration_min, started_at, ended_at, status, payment_method, console_id').eq('status', 'completed').order('ended_at', { ascending: false }).limit(15)
      if (error) throw error
      return data
    }
    case 'list_employees': {
      const { data, error } = await db.from('employees').select('name, role, is_active').order('name')
      if (error) throw error
      return data
    }
    case 'list_reservations': {
      const { data, error } = await db.from('reservations').select('customer_name, customer_phone, start_time, duration_min, status, console_id').order('start_time', { ascending: false }).limit(20)
      if (error) throw error
      return data
    }
    case 'list_expenses': {
      const { data, error } = await db.from('expenses').select('category, amount, description, expense_date').order('expense_date', { ascending: false }).limit(20)
      if (error) throw error
      return data
    }
    case 'get_revenue_summary': {
      if (!venueId) return { error: 'venue not found' }
      const today = new Date().toISOString().slice(0, 10)
      const from = (args.from as string) ?? today
      const to = (args.to as string) ?? today
      const { data, error } = await db.rpc('get_venue_pnl', { p_venue_id: venueId, p_from: from, p_to: to })
      if (error) throw error
      return data
    }
    case 'start_session': {
      const { data, error } = await db.rpc('start_session', { p_console_id: args.console_id, p_plan_id: args.plan_id, p_duration_min: args.duration_min, p_customer_name: args.customer_name ?? null, p_payment_method: args.payment_method, p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null) })
      if (error) throw error
      return data
    }
    case 'start_open_session': {
      const { data, error } = await db.rpc('start_open_session', { p_console_id: args.console_id, p_plan_id: args.plan_id, p_customer_name: args.customer_name ?? null, p_payment_method: args.payment_method, p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null) })
      if (error) throw error
      return data
    }
    case 'end_session': {
      const { error } = await db.rpc('end_session', { p_session_id: args.session_id, p_tip: args.tip ?? 0 })
      if (error) throw error
      return { ok: true }
    }
    case 'create_bar_sale': {
      if (!venueId) return { error: 'venue not found' }
      const { data, error } = await db.rpc('create_bar_sale', { p_venue_id: venueId, p_payment_method: args.payment_method, p_items: args.items, p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null), p_session_id: args.session_id ?? null, p_tip: args.tip ?? 0 })
      if (error) throw error
      return { sale_id: data }
    }
    case 'restock_product': {
      const id = args.product_id
      const add = Number(args.add_qty)
      if (!id || !Number.isFinite(add) || add <= 0) return { error: 'invalid args' }
      // only existing products — single() fails if not found, so we never create new ones
      const { data: prod, error: e1 } = await db.from('bar_products').select('id, name, stock_quantity').eq('id', id).single()
      if (e1 || !prod) return { error: 'product_not_found' }
      const newQty = (prod.stock_quantity ?? 0) + add
      const { error: e2 } = await db.from('bar_products').update({ stock_quantity: newQty }).eq('id', id)
      if (e2) throw e2
      return { name: prod.name, added: add, new_stock: newQty }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

// Attach human-readable names to a proposed action so the confirm card shows
// "Red Bull" instead of "#7". Best-effort; runs as the caller (RLS applies).
async function enrichAction(
  db: SupabaseClient,
  action: { name: string; args: Record<string, unknown> },
) {
  const a = action.args
  try {
    if (action.name === 'restock_product' && a.product_id && !a.product_name) {
      const { data } = await db.from('bar_products').select('name').eq('id', a.product_id).single()
      if (data) a.product_name = data.name
    }
    if ((action.name === 'start_session' || action.name === 'start_open_session') && a.console_id && !a.console_name) {
      const { data } = await db.from('consoles').select('name').eq('id', a.console_id).single()
      if (data) a.console_name = data.name
    }
  } catch {
    // display-only enrichment — ignore failures
  }
}

// Gemini call with model fallback + retry on transient 429/503.
async function callGemini(systemPrompt: string, contents: unknown[]) {
  const base = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ function_declarations: toolDeclarations }],
    tool_config: { function_calling_config: { mode: 'AUTO' } },
  }
  for (const model of MODELS) {
    // Gemini 2.5 models "think" by default and can spend the whole output budget
    // on hidden thoughts, returning an EMPTY candidate (no text, no functionCall).
    // Disable thinking for a direct, reliable answer. Older models reject
    // thinkingConfig, so only attach it for 2.5.* (and a 400 falls to next model).
    const payload = JSON.stringify(
      model.includes('2.5')
        ? { ...base, generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }
        : base,
    )
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
      )
      if (res.ok) return await res.json()
      const errTxt = await res.text()
      console.error('GEMINI_HTTP', model, res.status, errTxt)
      if (res.status === 429 || res.status === 503) {
        await sleep(500 * (attempt + 1))
        continue // retry, then fall through to next model
      }
      if (res.status === 404 || res.status === 400) break // model/params unsupported → next model
      throw new Error(`Gemini ${res.status}: ${errTxt}`)
    }
  }
  throw new Error('OVERLOADED')
}

function systemPrompt(role: string, isPlatformAdmin: boolean): string {
  return `You are the AI assistant of the "Playroom" gaming-lounge admin panel. ALWAYS answer the user in Georgian, briefly and warmly.

Modules: Dashboard (consoles, sessions), Bar/POS, Cashier, History, Plans, Inventory, Customers, Employees, Accounting (P&L, expenses), Reservations.${isPlatformAdmin ? ' Platform (GOD MODE): all organizations.' : ''}
User role: ${role}${isPlatformAdmin ? ' + PLATFORM ADMIN (full cross-tenant access)' : ''}.

Rules:
- For data questions, call the relevant read function FIRST, then answer with live data.
- Before any action, resolve the needed ids via list functions. Never invent an id or data.
- To START A SESSION: FIRST call list_consoles (resolve the console id by position/name, e.g. "first console" = lowest slot_number) AND list_plans (resolve the plan id by name or price, e.g. "1 hour 5 GEL" = the plan priced 5/hour). Plans and consoles almost always exist — NEVER tell the user that plans/consoles are "not defined" without first calling these functions. THEN choose the session type:
  • If the user names a duration (e.g. "1 საათი", "30 წუთი") → call start_session with console_id, plan_id, duration_min, payment_method.
  • If the user does NOT name a duration and wants pay-as-you-go (e.g. "ღია სესია", "მიმდინარე", "რამდენ ხანსაც ითამაშებს", "open") → call start_open_session with console_id, plan_id, payment_method (NO duration_min). The price is settled when the session ends.
  If payment method is unstated assume cash.
- When the user says "add/restock [product] N" (დაამატე/შეავსე) it means restock_product (increase stock of an EXISTING product), NOT creating a new product. ALWAYS call list_bar_products first and pick the closest name match, including partial/transliterated matches (e.g. "კლასიკი"≈"კლასიკური"≈"CLASSIC"). If several products match, ask the user which one. Only if nothing matches at all, say the product does not exist and must be added manually in Inventory first.
- Be action-oriented: once you have enough info, call the function instead of asking more questions. Actions are auto-confirmed by the UI.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ type: 'error', text: 'AI არ არის კონფიგურირებული (GEMINI_API_KEY).' }, 200)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const token = authHeader.replace('Bearer ', '')
  const { data: auth, error: authErr } = await db.auth.getUser(token)
  if (authErr || !auth?.user) return json({ error: 'unauthorized' }, 401)

  // Per-user cost guard — ~20 AI requests/min (runs as the caller via their JWT).
  const { error: rlErr } = await db.rpc('ai_rate_limit', { p_limit: 20 })
  if (rlErr) {
    if ((rlErr.message ?? '').includes('rate_limit_exceeded')) {
      return json({ type: 'error', text: 'ძალიან ბევრი მოთხოვნა 🙏 დაელოდე ერთ წუთს და სცადე ხელახ.' }, 200)
    }
    console.error('RATE_LIMIT_ERROR', rlErr.message) // don't block on unexpected errors
  }

  let role = 'guest'
  let isPlatformAdmin = false
  let venueId: string | null = null
  try {
    const [{ data: member }, { data: isPlat }, { data: venues }] = await Promise.all([
      db.from('org_members').select('role').limit(1).maybeSingle(),
      db.rpc('is_platform_admin'),
      db.from('venues').select('id').limit(1),
    ])
    role = member?.role ?? 'guest'
    isPlatformAdmin = isPlat === true
    venueId = venues?.[0]?.id ?? null
  } catch (e) {
    console.error('CONTEXT_ERROR', (e as Error).message)
  }

  let body: {
    messages?: { role: 'user' | 'model'; text: string; image?: string }[]
    confirmedAction?: { name: string; args: Record<string, unknown> }
    action?: string
    from?: string
    to?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }

  const sys = systemPrompt(role, isPlatformAdmin)
  const overloadMsg = 'AI ამჟამად გადატვირთულია 🙏 სცადე რამდენიმე წამში.'

  // ---- Path C: Fraud Audit ----
  if (body.action === 'run_fraud_audit') {
    if (!venueId) return json({ error: 'venue not found' }, 400)
    try {
      const from = body.from || new Date(Date.now() - 7 * 86400000).toISOString()
      const to = body.to || new Date().toISOString()
      
      const { data: logs, error: logsErr } = await db.from('audit_logs')
        .select('created_at, actor_email, action, entity_type, payload')
        .eq('venue_id', venueId)
        .gte('created_at', from)
        .lte('created_at', to)
        .in('action', ['session.cancel', 'session.refund', 'bar_sale.void', 'expense.delete']) // Add more severity filter
        .order('created_at', { ascending: false })
        .limit(1000)

      if (logsErr) throw logsErr

      const auditSys = `You are a forensic AI Auditor for Martelounge. Analyze these security logs.
Look for:
- session.cancel or session.refund (especially repeating per operator)
- bar_sale.void (voiding orders)
- expense.delete

Generate a Markdown report IN GEORGIAN:
1. მოკლე შეჯამება (Executive Summary).
2. ნდობის ინდექსი (Trust Score 0-100) ყველა ოპერატორზე.
3. საეჭვო ქმედებები (ფაქტების ჩამონათვალი დროებით და მოვლენებით).
4. რეკომენდაციები.
Use neat markdown formatting.`

      const rawLogs = logs && logs.length > 0 ? logs : [{ info: 'ამ პერიოდში საეჭვო ლოგები (void/cancel) არ მოიძებნა.' }]

      const g = await callGemini(auditSys, [{ role: 'user', parts: [{ text: JSON.stringify(rawLogs) }] }])
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'აუდიტი ვერ მოხერხდა.'
      return json({ type: 'text', text })
    } catch (e) {
      console.error('AUDIT_ERROR', (e as Error).message)
      return json({ type: 'error', text: 'აუდიტის შეცდომა.' })
    }
  }

  // ---- Path A: execute a confirmed action, then summarize ----
  if (body.confirmedAction) {
    const { name, args } = body.confirmedAction
    if (!WRITE_TOOLS.has(name)) return json({ error: 'not a confirmable action' }, 400)
    try {
      const result = await runTool(db, venueId, name, args)
      const contents = [
        ...(body.messages ?? []).map((m) => {
          const parts: any[] = [{ text: m.text }]
          if (m.image) {
            parts.push({
              inline_data: {
                mime_type: 'image/webp', // Default to webp as per project standard
                data: m.image
              }
            })
          }
          return { role: m.role, parts }
        }),
        { role: 'user', parts: [{ text: `მოქმედება "${name}" შესრულდა. შედეგი: ${JSON.stringify(result)}. დაუდასტურე მომხმარებელს მოკლედ ქართულად.` }] },
      ]
      const g = await callGemini(sys, contents)
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'მზადაა ✅'
      return json({ type: 'text', text })
    } catch (e) {
      if ((e as Error).message === 'OVERLOADED') return json({ type: 'text', text: 'შესრულდა ✅' })
      console.error('CONFIRM_ERROR', (e as Error).message)
      return json({ type: 'error', text: `ვერ შესრულდა: ${(e as Error).message}` })
    }
  }

  // ---- Path B: agent loop ----
  const contents: unknown[] = (body.messages ?? []).map((m) => {
    const parts: any[] = [{ text: m.text }]
    if (m.image) {
      parts.push({
        inline_data: {
          mime_type: 'image/webp',
          data: m.image
        }
      })
    }
    return { role: m.role, parts }
  })
  try {
    for (let hop = 0; hop < 6; hop++) {
      const g = await callGemini(sys, contents)
      const parts = g?.candidates?.[0]?.content?.parts ?? []
      const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall as
        | { name: string; args: Record<string, unknown> }
        | undefined

      if (!fnCall) {
        const text = parts.find((p: { text?: string }) => p.text)?.text
        if (!text) {
          console.error('EMPTY_CANDIDATE', JSON.stringify(g?.candidates?.[0]?.finishReason ?? g))
          return json({ type: 'text', text: 'ვერ მოვამზადე პასუხი 🙏 სცადე ხელახლა ან უფრო კონკრეტულად დაწერე.' })
        }
        return json({ type: 'text', text })
      }
      if (WRITE_TOOLS.has(fnCall.name)) {
        const action = { name: fnCall.name, args: fnCall.args ?? {} }
        await enrichAction(db, action)
        return json({ type: 'confirm', action, messages: body.messages ?? [] })
      }
      if (READ_TOOLS.has(fnCall.name)) {
        let result: unknown
        try {
          result = await runTool(db, venueId, fnCall.name, fnCall.args ?? {})
        } catch (e) {
          result = { error: (e as Error).message }
        }
        contents.push({ role: 'model', parts: [{ functionCall: fnCall }] })
        contents.push({ role: 'user', parts: [{ functionResponse: { name: fnCall.name, response: { result } } }] })
        continue
      }
      return json({ type: 'text', text: 'უცნობი ფუნქცია.' })
    }
    return json({ type: 'text', text: 'ვერ დავასრულე — სცადე უფრო კონკრეტულად.' })
  } catch (e) {
    if ((e as Error).message === 'OVERLOADED') return json({ type: 'error', text: overloadMsg })
    console.error('AGENT_LOOP_ERROR', (e as Error).message)
    return json({ type: 'error', text: 'შეცდომა: ' + (e as Error).message })
  }
})
