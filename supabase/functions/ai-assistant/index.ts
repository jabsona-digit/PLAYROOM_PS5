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
const WRITE_TOOLS = new Set(['start_session', 'end_session', 'create_bar_sale', 'restock_product'])

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
  { name: 'start_session', description: 'ახალი სესია კონსოლზე. წინასწარ მოიძიე console_id და plan_id.', parameters: { type: 'object', properties: { console_id: { type: 'integer' }, plan_id: { type: 'integer' }, duration_min: { type: 'integer' }, customer_name: { type: 'string' }, payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] }, bank: { type: 'string', enum: ['TBC', 'BOG'] } }, required: ['console_id', 'plan_id', 'duration_min', 'payment_method'] } },
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

// Gemini call with retry on transient 429/503 (rate limit / overload).
async function callGemini(systemPrompt: string, contents: unknown[]) {
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ function_declarations: toolDeclarations }],
          tool_config: { function_calling_config: { mode: 'AUTO' } },
        }),
      },
    )
    if (res.ok) return await res.json()
    lastErr = await res.text()
    console.error('GEMINI_HTTP', res.status, lastErr)
    if (res.status === 429 || res.status === 503) {
      await sleep(700 * (attempt + 1))
      continue
    }
    throw new Error(`Gemini ${res.status}: ${lastErr}`)
  }
  // exhausted retries on overload
  const overloaded = new Error('OVERLOADED')
  ;(overloaded as Error & { detail?: string }).detail = lastErr
  throw overloaded
}

function systemPrompt(role: string, isPlatformAdmin: boolean): string {
  return `შენ ხარ "Playroom"-ის ადმინ პანელის AI დამხმარე. პასუხობ ქართულად, მოკლედ და თბილად.

პანელის მოდულები და ღილაკები:
- მთავარი: კონსოლები ბარათებად. "სესიის დაწყება" — ახალი თამაში; "გაგრძელება" — დროის დამატება; "დასრულება" — დახურვა + ჩაიანი. ბარათი ნეონით ანათებს: ლურჯი=ნორმა, ნარინჯი=≤10წთ, წითელი=≤5წთ/ამოწურული.
- ბარი (POS): პროდუქტზე დაჭერა → კალათა → "გადახდა". შეიძლება ღია სესიას მიება.
- კასა: ცვლის გახსნა/დახურვა, შემოსავლის დაშლა (ნაღდი/ბარათი/გადარიცხვა), Z-რეპორტი.
- ისტორია: დასრულებული სესიები, refund/void. ტარიფები: ფასების მართვა.
- საწყობი: ბარის მარაგი. კლიენტები: ბაზა, ქულები, ფასდაკლება. თანამშრომლები: PIN, ცვლები.
- პარამეტრები, გამოწერა, ბუღალტერია (P&L, ხარჯები), ჯავშნები.
${isPlatformAdmin ? '- პლატფორმა (GOD MODE): ყველა ორგანიზაცია, შეჩერება/გააქტიურება, "ნახვა".' : ''}

მომხმარებლის როლი: ${role}${isPlatformAdmin ? ' + PLATFORM ADMIN (სრული წვდომა ყველა ორგანიზაციაზე)' : ''}.

წესები:
- მონაცემებზე კითხვისას ჯერ გამოიძახე read-ფუნქცია, მერე უპასუხე ცოცხალი მონაცემებით.
- მოქმედებამდე (სესია/გაყიდვა) აუცილებლად მოიძიე საჭირო id-ები (list_consoles/list_plans/list_bar_products).
- არასდროს გამოიგონო id ან მონაცემი. გაუგებრობისას ჰკითხე მომხმარებელს.
- მარაგის შევსება (restock_product) მხოლოდ უკვე არსებულ პროდუქტზე — ჯერ list_bar_products-ით იპოვე პროდუქტი. თუ პროდუქტი არ არსებობს, არ შექმნა — უთხარი მომხმარებელს რომ ჯერ საწყობში უნდა დაამატოს.
- მოქმედებებს დადასტურება ავტომატურად სჭირდება — შენ უბრალოდ გამოიძახე ფუნქცია.`
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
    messages?: { role: 'user' | 'model'; text: string }[]
    confirmedAction?: { name: string; args: Record<string, unknown> }
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }

  const sys = systemPrompt(role, isPlatformAdmin)
  const overloadMsg = 'AI ამჟამად გადატვირთულია 🙏 სცადე რამდენიმე წამში.'

  // ---- Path A: execute a confirmed action, then summarize ----
  if (body.confirmedAction) {
    const { name, args } = body.confirmedAction
    if (!WRITE_TOOLS.has(name)) return json({ error: 'not a confirmable action' }, 400)
    try {
      const result = await runTool(db, venueId, name, args)
      const contents = [
        ...(body.messages ?? []).map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
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
  const contents: unknown[] = (body.messages ?? []).map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  try {
    for (let hop = 0; hop < 6; hop++) {
      const g = await callGemini(sys, contents)
      const parts = g?.candidates?.[0]?.content?.parts ?? []
      const fnCall = parts.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall as
        | { name: string; args: Record<string, unknown> }
        | undefined

      if (!fnCall) {
        const text = parts.find((p: { text?: string }) => p.text)?.text ?? '...'
        return json({ type: 'text', text })
      }
      if (WRITE_TOOLS.has(fnCall.name)) {
        return json({ type: 'confirm', action: { name: fnCall.name, args: fnCall.args ?? {} }, messages: body.messages ?? [] })
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
