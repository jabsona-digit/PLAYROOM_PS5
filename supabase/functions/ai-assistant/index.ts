// @ts-nocheck
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

// The model sometimes PROMISES an action ("დავამატებ 10 ცალს…") in plain text
// instead of emitting the functionCall — so nothing happens. Detect that intent
// to nudge it once into actually calling the tool.
const PROMISE_RE =
  /(და(ვ)?ამატებ|ჩავამატებ|შევავსებ|დავიწყებ|გავხსნი|გავყიდ|დავასრულებ|დავხურავ|დავარეგისტრირებ|გავაკეთებ|ვამატებ|ვიწყებ)|\b(i('?ll| will)|let me)\s+(add|start|sell|create|restock|register|open|close|end)/i

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
  { name: 'create_bar_sale', description: 'ბარის გაყიდვა. items:[{product_name|product_id, qty}]. product_name შეიძლება ქართულად/ნაწილობრივ — სერვერი მოძებნის; product_id არასავალდებულოა.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { product_id: { type: 'integer' }, product_name: { type: 'string' }, qty: { type: 'integer' } }, required: ['qty'] } }, payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] }, bank: { type: 'string', enum: ['TBC', 'BOG'] }, tip: { type: 'number' }, session_id: { type: 'string' } }, required: ['items', 'payment_method'] } },
  { name: 'restock_product', description: 'არსებული პროდუქტის მარაგის შევსება — ემატება მიმდინარე მარაგს. მხოლოდ უკვე არსებულ პროდუქტზე მუშაობს, ახალს ვერ ქმნის. გადაეცი product_name (ქართულად/ტრანსლიტერაციით/ნაწილობრივ — სერვერი თვითონ მოძებნის, მაგ. "ქემელი ბლუ"→"CAMEL BLUE"); product_id არასავალდებულოა.', parameters: { type: 'object', properties: { product_id: { type: 'integer' }, add_qty: { type: 'integer' }, product_name: { type: 'string' } }, required: ['add_qty'] } },
]

const GUEST_TOOLS = [
  {
    name: 'search_venues',
    description: 'Searches the published gaming venues (clubs/playrooms) in the database. ALWAYS call this before answering anything about which clubs/venues exist, their names, prices or locations — never answer from memory. Pass `query` to look up a venue by NAME or CITY (e.g. "nikaragua", "Tbilisi"); pass amenity flags to filter; with no args it lists the top venues. Returns id, slug, name, city, price, rating, amenities (VIP/Bar/Billiard).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Venue/club name or city to search for (partial OK). Use this whenever the user names a specific club or city.' },
        lat: { type: 'number' },
        lng: { type: 'number' },
        require_vip: { type: 'boolean' },
        require_billiard: { type: 'boolean' },
        require_bar: { type: 'boolean' },
        limit: { type: 'integer' }
      }
    }
  },
  {
    name: 'check_live_availability',
    description: 'Checks if a specific venue has free gaming consoles/rooms RIGHT NOW.',
    parameters: {
      type: 'object',
      properties: {
        venue_id: { type: 'string' }
      },
      required: ['venue_id']
    }
  },
  {
    name: 'search_tournaments',
    description: 'Lists upcoming and active gaming TOURNAMENTS (competitions/championships/events). ALWAYS call this before answering anything about tournaments — never from memory. Returns each tournament name, game, venue + city, date (starts_at), entry_fee, prizes (prize_pool=1st GEL, prize_second=2nd GEL, prize_third_minutes=3rd free play-time), how many registered, and status (registration=open to sign up). Pass `query` to filter by tournament/game/venue/city name.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tournament, game, venue or city name to filter by (partial OK).' }
      }
    }
  }
]

// ── Georgian→Latin transliteration + fuzzy product matching ──────────────
// Lets the assistant resolve a product the way the user actually typed it
// ("ქემელი ბლუ" → "CAMEL BLUE"), so the model never needs an exact id.
const KA2LAT: Record<string, string> = {
  ა:'a',ბ:'b',გ:'g',დ:'d',ე:'e',ვ:'v',ზ:'z',თ:'t',ი:'i',კ:'k',ლ:'l',მ:'m',
  ნ:'n',ო:'o',პ:'p',ჟ:'zh',რ:'r',ს:'s',ტ:'t',უ:'u',ფ:'f',ქ:'k',ღ:'gh',ყ:'q',
  შ:'sh',ჩ:'ch',ც:'c',ძ:'dz',წ:'c',ჭ:'ch',ხ:'kh',ჯ:'j',ჰ:'h',
}
type Prod = { id: number; name: string; price?: number; stock_quantity?: number }

const translit = (s: string) => (s ?? '').split('').map((c) => KA2LAT[c] ?? c).join('')
const normName = (s: string) =>
  translit((s ?? '').toLowerCase())
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/c/g, 'k')        // bridge the c/k sound ("camel" ↔ "ქემელ"→"kemel")
    .replace(/\s+/g, ' ')
    .trim()

function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}
function tokenSim(a: string, b: string): number {
  if (a === b) return 1
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85
  return 1 - lev(a, b) / Math.max(a.length, b.length)
}
function scoreName(query: string, name: string): number {
  const nq = normName(query), nn = normName(name)
  if (!nq || !nn) return 0
  if (nq === nn) return 1
  if (nn.includes(nq) || nq.includes(nn)) return 0.9
  const qt = nq.split(' ').filter(Boolean), nt = nn.split(' ').filter(Boolean)
  if (!qt.length || !nt.length) return 0
  let sum = 0
  for (const q of qt) {
    let best = 0
    for (const t of nt) best = Math.max(best, tokenSim(q, t))
    sum += best
  }
  return sum / qt.length
}
// Resolve a product by exact id (if valid) else fuzzy name. Returns one
// confident match, OR a short candidate list to disambiguate, OR neither.
function resolveProduct(query: string | undefined, products: Prod[], id?: unknown): { product?: Prod; candidates?: Prod[] } {
  const pid = typeof id === 'number' ? id : (id != null && id !== '' ? Number(id) : NaN)
  if (Number.isFinite(pid)) {
    const byId = products.find((p) => p.id === pid)
    if (byId) return { product: byId }
  }
  if (!query || !query.trim()) return {}
  const scored = products
    .map((p) => ({ p, s: scoreName(query, p.name) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
  if (scored.length === 0) return {}
  if (scored.length === 1 || scored[0].s - scored[1].s >= 0.18) return { product: scored[0].p }
  return { candidates: scored.slice(0, 4).map((x) => x.p) }
}
async function loadActiveProducts(db: SupabaseClient): Promise<Prod[]> {
  const { data } = await db.from('bar_products').select('id, name, price, stock_quantity').eq('is_active', true)
  return (data ?? []) as Prod[]
}
// Resolve product refs inside a proposed write action (mutates args in place).
// Returns a functionResponse-style object to feed back to the model when a
// reference is ambiguous/unknown, or null when everything resolved cleanly.
async function resolveActionProducts(db: SupabaseClient, action: { name: string; args: Record<string, unknown> }): Promise<unknown | null> {
  const a = action.args
  if (action.name === 'restock_product') {
    const products = await loadActiveProducts(db)
    const r = resolveProduct(a.product_name as string | undefined, products, a.product_id)
    if (r.product) { a.product_id = r.product.id; a.product_name = r.product.name; return null }
    if (r.candidates) return { needs_clarification: true, candidates: r.candidates.map((p) => p.name) }
    return { error: 'product_not_found', available: products.map((p) => p.name) }
  }
  if (action.name === 'create_bar_sale') {
    const items = (a.items as { product_id?: unknown; product_name?: string; qty?: unknown }[]) ?? []
    if (!items.length) return null
    const products = await loadActiveProducts(db)
    const ambiguous: { query: string; candidates: string[] }[] = []
    const notFound: string[] = []
    for (const it of items) {
      const r = resolveProduct(it.product_name, products, it.product_id)
      if (r.product) { it.product_id = r.product.id; it.product_name = r.product.name }
      else if (r.candidates) ambiguous.push({ query: it.product_name ?? '', candidates: r.candidates.map((p) => p.name) })
      else notFound.push(it.product_name ?? String(it.product_id ?? '?'))
    }
    if (ambiguous.length) return { needs_clarification: true, ambiguous }
    if (notFound.length) return { error: 'product_not_found', not_found: notFound, available: products.map((p) => p.name) }
    return null
  }
  return null
}

async function runTool(
  db: SupabaseClient,
  venueId: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_overview': {
      const { data, error } = await db.from('consoles').select('id, name, status, deleted_at').is('deleted_at', null).eq('venue_id', venueId)
      if (error) throw error
      const active = (data ?? []).filter((c) => c.status === 'active').length
      const expiring = (data ?? []).filter((c) => c.status === 'warning_5' || c.status === 'expired').length
      return { total_consoles: data?.length ?? 0, active, free: (data?.length ?? 0) - active, expiring }
    }
    case 'list_consoles': {
      const { data, error } = await db.from('consoles').select('id, name, slot_number, status, sessions(id, customer_name, ends_at, status)').is('deleted_at', null).eq('venue_id', venueId).order('slot_number')
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
      const { data, error } = await db.from('bar_sales').select('created_at, total, tip_amount, payment_method, bank, customer_name, voided_at, bar_sale_items(name, qty, line_total)').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(15)
      if (error) throw error
      return data
    }
    case 'recent_sessions': {
      const { data, error } = await db.from('sessions').select('customer_name, price_total, tip_amount, duration_min, started_at, ended_at, status, payment_method, console_id').eq('venue_id', venueId).eq('status', 'completed').order('ended_at', { ascending: false }).limit(15)
      if (error) throw error
      return data
    }
    case 'list_employees': {
      const { data, error } = await db.from('employees').select('name, role, is_active').order('name')
      if (error) throw error
      return data
    }
    case 'list_reservations': {
      const { data, error } = await db.from('reservations').select('customer_name, customer_phone, start_time, duration_min, status, console_id').eq('venue_id', venueId).order('start_time', { ascending: false }).limit(20)
      if (error) throw error
      return data
    }
    case 'list_expenses': {
      const { data, error } = await db.from('expenses').select('category, amount, description, expense_date').eq('venue_id', venueId).order('expense_date', { ascending: false }).limit(20)
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
      // resolve any name-only items to ids (Georgian/translit/fuzzy)
      let items = (args.items as { product_id?: unknown; product_name?: string; qty: number }[]) ?? []
      if (items.some((it) => (!it.product_id || it.product_id === '') && it.product_name)) {
        const products = await loadActiveProducts(db)
        items = items.map((it) => {
          if ((!it.product_id || it.product_id === '') && it.product_name) {
            const r = resolveProduct(it.product_name, products)
            if (r.product) return { product_id: r.product.id, qty: it.qty }
          }
          return it
        })
      }
      const cleanItems = items.map((it) => ({ product_id: it.product_id, qty: it.qty }))
      const { data, error } = await db.rpc('create_bar_sale', { p_venue_id: venueId, p_payment_method: args.payment_method, p_items: cleanItems, p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null), p_session_id: args.session_id ?? null, p_tip: args.tip ?? 0 })
      if (error) throw error
      return { sale_id: data }
    }
    case 'restock_product': {
      let id = args.product_id
      const add = Number(args.add_qty)
      if (!Number.isFinite(add) || add <= 0) return { error: 'invalid args' }
      // resolve by name if the id is missing/unknown (Georgian/translit/fuzzy)
      if ((!id || id === '') && args.product_name) {
        const r = resolveProduct(args.product_name as string, await loadActiveProducts(db))
        if (r.product) id = r.product.id
      }
      if (!id) return { error: 'product_not_found' }
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

// Fire-and-forget Gemini usage metering (0125): logs token usage via the caller's
// JWT (log_ai_usage resolves user+org server-side). Never throws / never blocks.
function meterUsage(db: any, model: string, data: any) {
  if (!db) return
  const u = data?.usageMetadata ?? {}
  try {
    const p = Promise.resolve(
      db.rpc('log_ai_usage', {
        p_model: model,
        p_prompt: u.promptTokenCount ?? 0,
        p_candidates: u.candidatesTokenCount ?? 0,
        p_total: u.totalTokenCount ?? 0,
      }),
    ).then(() => {}, () => {})
    // @ts-ignore — Supabase Edge keeps the isolate alive to finish the insert
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) (EdgeRuntime as any).waitUntil(p)
  } catch { /* metering must never affect the AI response */ }
}

// Fire-and-forget error capture (0128): surfaces unhandled failures to edge_error_log via the
// CALLER's JWT client (preserves the no-service_role invariant). NEVER throws / never blocks.
function logEdgeError(client: any, message: string, context: Record<string, unknown> = {}) {
  try {
    const p = Promise.resolve(
      client.rpc('log_edge_error', { p_fn: 'ai-assistant', p_message: String(message ?? '').slice(0, 2000), p_context: context }),
    ).then(() => {}, () => {})
    // @ts-ignore Supabase Edge keeps the isolate alive to finish the insert
    if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) (EdgeRuntime as any).waitUntil(p)
  } catch { /* logging must never break the function */ }
}

// Gemini call with model fallback + retry on transient 429/503.
async function callGemini(systemPrompt: string, contents: unknown[], tools: any[] = toolDeclarations, db?: any) {
  const base = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [{ function_declarations: tools }],
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
      if (res.ok) {
        const data = await res.json()
        meterUsage(db, model, data)
        return data
      }
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
- Before any action, resolve the needed ids via list functions. Never invent an id or data. (Exception: for BAR PRODUCTS you may pass product_name directly — the server fuzzy-matches it; Georgian, transliterated or partial all work.)
- To START A SESSION: FIRST call list_consoles (resolve the console id by position/name, e.g. "first console" = lowest slot_number) AND list_plans (resolve the plan id by name or price, e.g. "1 hour 5 GEL" = the plan priced 5/hour). Plans and consoles almost always exist — NEVER tell the user that plans/consoles are "not defined" without first calling these functions. THEN choose the session type:
  • If the user names a duration (e.g. "1 საათი", "30 წუთი") → call start_session with console_id, plan_id, duration_min, payment_method.
  • If the user does NOT name a duration and wants pay-as-you-go (e.g. "ღია სესია", "მიმდინარე", "რამდენ ხანსაც ითამაშებს", "open") → call start_open_session with console_id, plan_id, payment_method (NO duration_min). The price is settled when the session ends.
  If payment method is unstated assume cash.
- When the user says "add/restock [product] N" (დაამატე/შეავსე) it means restock_product (increase stock of an EXISTING product), NOT creating a new product. Call restock_product with product_name exactly as the user said it (Georgian/transliterated/partial is fine — the server matches it, e.g. "ქემელი ბლუ"→"CAMEL BLUE") and add_qty. If the tool returns needs_clarification, show the candidates and ask which one; if it returns product_not_found, tell the user it must be added in Inventory first. The same product_name matching works for create_bar_sale items.
- Be action-oriented: once you have enough info, call the function instead of asking more questions.
- CRITICAL: to perform an action you MUST emit the functionCall. NEVER reply with only a promise like "დავამატებ…/დავიწყებ…/გავყიდი…" without calling the tool in the SAME turn — calling a write tool pops a confirm card for the user, so calling it IS how you act. Either call the function now, or (if one detail is missing) ask one short question.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ type: 'error', text: 'AI არ არის კონფიგურირებული (GEMINI_API_KEY).' }, 200)

  let body: {
    messages?: { role: 'user' | 'model'; text: string; image?: string }[]
    confirmedAction?: { name: string; args: Record<string, unknown> }
    action?: string
    from?: string
    to?: string
    venue_id?: string
    daily_hours?: number
    date?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid body' }, 400)
  }

  const isGuestConcierge = body.action === 'guest_concierge'

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const token = authHeader.replace('Bearer ', '')
  
  let role = 'guest'
  let isPlatformAdmin = false
  let venueId: string | null = null

  if (!isGuestConcierge) {
    const { data: auth, error: authErr } = await db.auth.getUser(token)
    if (authErr || !auth?.user) return json({ error: 'unauthorized' }, 401)

    // Per-user cost guard — ~20 AI requests/min (runs as the caller via their JWT).
    const { error: rlErr } = await db.rpc('ai_rate_limit', { p_limit: 20 })
    if (rlErr) {
      if ((rlErr.message ?? '').includes('rate_limit_exceeded')) {
        return json({ type: 'error', text: 'ძალიან ბევრი მოთხოვნა 🙏 დაელოდე ერთ წუთს და სცადე ხელახ.' }, 200)
      }
      console.error('RATE_LIMIT_ERROR', rlErr.message)
    }

    try {
      const [{ data: member }, { data: isPlat }, { data: venues }] = await Promise.all([
        db.from('org_members').select('role').limit(1).maybeSingle(),
        db.rpc('is_platform_admin'),
        db.from('venues').select('id').limit(1),
      ])
      role = member?.role ?? 'guest'
      isPlatformAdmin = isPlat === true
      // Prefer the venue the user is currently viewing (sent by the client, RLS-bounded);
      // fall back to their first venue. Without this, a platform admin (who can read EVERY
      // org via RLS) would aggregate consoles/sessions across ALL orgs.
      venueId = body.venue_id ?? venues?.[0]?.id ?? null
    } catch (e) {
      console.error('CONTEXT_ERROR', (e as Error).message)
    }
  }

  const sys = systemPrompt(role, isPlatformAdmin)
  const overloadMsg = 'AI ამჟამად გადატვირთულია 🙏 სცადე რამდენიმე წამში.'

  // ---- Path F: Marketplace Guest Concierge ----
  if (isGuestConcierge) {
    const guestSys = `You are a Premium AI Concierge & Smart Upseller for Martelounge (a Georgian gaming lounge network).
Always answer in Georgian. Be warm, professional, dynamic, and persuasive.

Rules:
1. Hyper-Personalization: Greet the user warmly if they share their name or intent.
2. If they want to play, playfully ask their location and preferences (VIP room, billiard, bar/drinks).
3. NEVER guess or invent venues, addresses, or districts. ALWAYS call search_venues first, and state ONLY the real city + address that the tool returns. If the user names an area/district (e.g. ვარკეთილი) and NO returned venue's address matches it, tell them honestly that there isn't one in that exact area and offer the nearest option naming its REAL address — NEVER agree that a venue is in an area it is not in.
4. If they want VIP, immediately call check_live_availability for that venue to check if rooms are free. If low, create a FOMO effect ("მხოლოდ 1 დარჩა და დაგიჯავშნოთ?").
5. Up-sell gently and ONLY with things you can verify. You do NOT know a venue's menu, so NEVER promise specific items (hookah/ჩილიმი, particular drinks/dishes) — say it generally at most ("ადგილზე ბარიც გაქვთ"), never invent offerings.
6. You CANNOT create or confirm bookings yourself — NEVER say a booking is confirmed or "being prepared". To actually book, send the venue's OWN page link (https://play.martelounge.ge/ followed by its slug) and tell them to pick the time and confirm there. Never present a fake confirmation.`
    
    const contents: unknown[] = (body.messages ?? []).map((m: any) => ({ role: m.role, parts: [{ text: m.text }] }))
    try {
      for (let hop = 0; hop < 4; hop++) {
        const g = await callGemini(guestSys, contents, GUEST_TOOLS, db)
        const parts = g?.candidates?.[0]?.content?.parts ?? []
        const fnCall = parts.find((p: any) => p.functionCall)?.functionCall as { name: string; args: Record<string, any> } | undefined
        if (!fnCall) {
          const text = parts.find((p: any) => p.text)?.text ?? 'ვერ მოვამზადე პასუხი.'
          return json({ type: 'text', text })
        }
        let result: unknown
        try {
          if (fnCall.name === 'search_venues') {
            const { data, error } = await db.rpc('search_venues_for_ai', {
              p_query: fnCall.args.query ?? null,
              p_lat: fnCall.args.lat, p_lng: fnCall.args.lng,
              p_require_vip: fnCall.args.require_vip,
              p_require_billiard: fnCall.args.require_billiard,
              p_require_bar: fnCall.args.require_bar,
              p_limit: fnCall.args.limit ?? 8
            })
            if (error) throw error
            result = data
          } else if (fnCall.name === 'check_live_availability') {
            const { data, error } = await db.rpc('check_venue_availability_for_ai', { p_venue_id: fnCall.args.venue_id })
            if (error) throw error
            result = data
          } else if (fnCall.name === 'search_tournaments') {
            const { data, error } = await db.rpc('search_tournaments_for_ai', { p_query: fnCall.args.query ?? null })
            if (error) throw error
            result = data
          } else {
            result = { error: 'Unknown guest tool: ' + fnCall.name }
          }
        } catch(e) {
          result = { error: (e as Error).message }
        }
        contents.push({ role: 'model', parts: [{ functionCall: fnCall }] })
        contents.push({ role: 'user', parts: [{ functionResponse: { name: fnCall.name, response: { result } } }] })
      }
      return json({ type: 'text', text: 'გთხოვთ დააკონკრეტოთ კითხვა.' })
    } catch(e) {
      console.error('GUEST_ERROR', (e as Error).message)
      return json({ type: 'error', text: overloadMsg })
    }
  }

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

      const g = await callGemini(auditSys, [{ role: 'user', parts: [{ text: JSON.stringify(rawLogs) }] }], undefined, db)
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'აუდიტი ვერ მოხერხდა.'
      return json({ type: 'text', text })
    } catch (e) {
      console.error('AUDIT_ERROR', (e as Error).message)
      return json({ type: 'error', text: 'აუდიტის შეცდომა.' })
    }
  }

  // ---- Path D: RevPACH AI advisor ----
  if (body.action === 'run_revpach_advisor') {
    const vId = body.venue_id ?? venueId
    if (!vId) return json({ error: 'venue not found' }, 400)
    try {
      const from = body.from || new Date(Date.now() - 30 * 86400000).toISOString()
      const to = body.to || new Date().toISOString()
      const { data: analytics, error: aErr } = await db.rpc('get_console_analytics', {
        p_venue_id: vId, p_from: from, p_to: to, p_daily_hours: body.daily_hours ?? 12,
      })
      if (aErr) throw aErr

      const advSys = `You are a revenue strategist for a Georgian PS5 gaming lounge. You receive RevPACH analytics JSON
(RevPACH = revenue per available console-hour; occupancy %; a per-console matrix; a 7×24 demand heatmap where
dow 0=Sunday..6=Saturday and hour is 0-23 in Georgian local time).

Write a SHORT, SPECIFIC, ACTIONABLE report in GEORGIAN markdown:
1. **დატვირთვის გაზრდა** — 2-3 კონკრეტული აქცია მკვდარი ზონებისთვის (დაასახელე დღე+საათი heatmap-იდან, შესთავაზე ფასი/შეთავაზება).
2. **სუსტი / უქმე კონსოლები** — რა ვუყოთ.
3. **ფასი / ტევადობა** — ერთი ჭკვიანი დასკვნა.
Use the real numbers from the data (RevPACH, occupancy %, gold hour). Keep it under ~180 words. No preamble, do not echo the JSON.`

      const g = await callGemini(advSys, [{ role: 'user', parts: [{ text: JSON.stringify(analytics) }] }], undefined, db)
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'რეკომენდაცია ვერ მომზადდა.'
      return json({ type: 'text', text })
    } catch (e) {
      console.error('REVPACH_ADVISOR_ERROR', (e as Error).message)
      return json({ type: 'error', text: 'რეკომენდაციის შეცდომა.' })
    }
  }

  // ---- Path E: AI Closing Brief (the owner's daily executive report) ----
  if (body.action === 'run_daily_brief') {
    const vId = body.venue_id ?? venueId
    if (!vId) return json({ error: 'venue not found' }, 400)
    try {
      const args: Record<string, unknown> = { p_venue_id: vId }
      if (body.date) args.p_date = body.date
      const { data, error } = await db.rpc('get_daily_brief_data', args)
      if (error) throw error

      // Operator joystick-integrity flags (trailing 30d) — zero-hardware anti-fraud (0095).
      let operator_flags: unknown[] = []
      try {
        const { data: venueRow } = await db.from('venues').select('org_id').eq('id', vId).single()
        const orgId = (venueRow as { org_id?: string } | null)?.org_id
        if (orgId) {
          const briefTo = body.date ? new Date(body.date as string) : new Date()
          const briefFrom = new Date(briefTo.getTime() - 30 * 86_400_000)
          const { data: oi } = await db.rpc('get_operator_integrity', {
            p_org_id: orgId, p_from: briefFrom.toISOString(), p_to: briefTo.toISOString(), p_venue_id: vId,
          })
          operator_flags = ((oi as { operators?: Array<{ flag?: boolean }> } | null)?.operators ?? [])
            .filter((o) => o.flag)
        }
      } catch (_) { /* best-effort — never block the brief */ }
      const briefPayload = { ...(data as Record<string, unknown>), operator_flags }

      const briefSys = `You are an elite AI Chief Operations Officer (COO) and Strategic Analyst for a Georgian gaming lounge network, briefing the TRUE OWNER on today's performance.
You receive a JSON snapshot (revenue today vs yesterday in GEL, sessions, total hours, top_console, idle_consoles, peak_hour_tbilisi 0-23, cancels/voids/refunds today, low_stock[], hardware_warnings[], operator_flags[] = staff ringing fewer joysticks than the venue average over 30d).

Your goal isn't just to report numbers—it's to uncover hidden patterns, analyze operational risks, and generate revenue-maximizing strategies.

Write a crisp, highly analytical, and strategic end-of-day brief in GEORGIAN markdown:
1. 📈 **დღის შეფასება (Executive Summary):** 1 punchy headline and a dynamic letter grade (A+/A/B/C/D) based on revenue trajectory and utilization. Briefly explain *why*.
2. 💡 **ღრმა ანალიტიკა და კორელაციები:** Find the "Why" behind the data. Which hour drove the most efficiency? Are idle consoles directly bleeding revenue? Point out non-obvious correlations.
3. 🚨 **რისკები და კონტროლი (Risk Management):** Analyze any fraud indicators (abnormal cancels/voids/refunds). If operator_flags[] is non-empty, NAME the flagged operator(s) + their joystick deviation as an under-ringing CHECK (frame as "worth verifying", never a definitive accusation). Report on physical risks (low_stock on high-margin items, hardware_warnings).
4. 🎯 **ხვალინდელი სტრატეგია (Action Plan):** Provide EXACTLY 3 highly creative, data-driven actions. (e.g., "Tomorrow 14:00-17:00 is historically dead, launch a -20% student promo", "Restock X immediately before the evening rush").

Be ruthless with insights, precise with REAL numbers, and never just echo the JSON. Keep it professional, sharp, under ~200 words. No preamble.`

      const g = await callGemini(briefSys, [{ role: 'user', parts: [{ text: JSON.stringify(briefPayload) }] }], undefined, db)
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'ანგარიში ვერ მომზადდა.'
      return json({ type: 'text', text })
    } catch (e) {
      console.error('DAILY_BRIEF_ERROR', (e as Error).message)
      return json({ type: 'error', text: 'ანგარიშის შეცდომა.' })
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
      const g = await callGemini(sys, contents, undefined, db)
      const text = g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? 'მზადაა ✅'
      return json({ type: 'text', text })
    } catch (e) {
      if ((e as Error).message === 'OVERLOADED') return json({ type: 'text', text: 'შესრულდა ✅' })
      console.error('CONFIRM_ERROR', (e as Error).message)
      logEdgeError(db, (e as Error).message, { path: 'confirm', action: name })
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
    let nudged = false
    for (let hop = 0; hop < 6; hop++) {
      const g = await callGemini(sys, contents, undefined, db)
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
        // Model promised an action but didn't call the tool → nudge it once to
        // actually emit the functionCall (otherwise nothing happens).
        if (!nudged && PROMISE_RE.test(text)) {
          nudged = true
          contents.push({ role: 'model', parts: [{ text }] })
          contents.push({ role: 'user', parts: [{ text: 'შეასრულე ახლავე: გამოიძახე შესაბამისი ფუნქცია (functionCall) — მაგ. restock_product / create_bar_sale / start_session. არ დაწერო მხოლოდ რომ გააკეთებ. თუ ერთი დეტალი აკლია, ჰკითხე მოკლედ.' }] })
          continue
        }
        return json({ type: 'text', text })
      }
      if (WRITE_TOOLS.has(fnCall.name)) {
        const action = { name: fnCall.name, args: fnCall.args ?? {} }
        // Resolve product references by name (Georgian/translit/fuzzy) up front.
        // If ambiguous or unknown, hand the result back to the model so it can
        // ask the user — instead of confirming a wrong/non-existent product.
        if (action.name === 'restock_product' || action.name === 'create_bar_sale') {
          const fb = await resolveActionProducts(db, action)
          if (fb) {
            contents.push({ role: 'model', parts: [{ functionCall: fnCall }] })
            contents.push({ role: 'user', parts: [{ functionResponse: { name: fnCall.name, response: { result: fb } } }] })
            continue
          }
        }
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
    logEdgeError(db, (e as Error).message, { path: 'agent_loop' })
    return json({ type: 'error', text: 'შეცდომა: ' + (e as Error).message })
  }
})
