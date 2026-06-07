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
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------------------
// Tool declarations exposed to Gemini (function calling).
// ---------------------------------------------------------------------------
const READ_TOOLS = new Set([
  'get_overview',
  'list_consoles',
  'list_plans',
  'list_bar_products',
  'get_revenue_summary',
])
const WRITE_TOOLS = new Set(['start_session', 'end_session', 'create_bar_sale'])

const toolDeclarations = [
  {
    name: 'get_overview',
    description:
      'მიმდინარე მდგომარეობა: აქტიური/თავისუფალი კონსოლები, მიმდინარე შემოსავალი, იწურება.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_consoles',
    description: 'კონსოლების სია id-ით, სახელით, სტატუსით და აქტიური სესიით.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_plans',
    description: 'აქტიური ტარიფების სია (id, სახელი, ფასი/სთ, ჯოისტიკები).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'list_bar_products',
    description: 'ბარის პროდუქტების სია (id, სახელი, ფასი, მარაგი).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_revenue_summary',
    description: 'შემოსავალი მოცემულ პერიოდში (სესიები + ბარი). თარიღები: YYYY-MM-DD.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'საწყისი თარიღი YYYY-MM-DD' },
        to: { type: 'string', description: 'საბოლოო თარიღი YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'start_session',
    description: 'ახალი სესიის დაწყება კონსოლზე. წინასწარ მოიძიე console_id და plan_id.',
    parameters: {
      type: 'object',
      properties: {
        console_id: { type: 'integer' },
        plan_id: { type: 'integer' },
        duration_min: { type: 'integer' },
        customer_name: { type: 'string' },
        payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] },
        bank: { type: 'string', enum: ['TBC', 'BOG'] },
      },
      required: ['console_id', 'plan_id', 'duration_min', 'payment_method'],
    },
  },
  {
    name: 'end_session',
    description: 'აქტიური სესიის დასრულება. session_id მოიძიე list_consoles-დან.',
    parameters: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        tip: { type: 'number', description: 'ჩაიანი, ₾ (არასავალდებულო)' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'create_bar_sale',
    description: 'ბარის გაყიდვა. items: [{product_id, qty}]. product_id list_bar_products-დან.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'integer' },
              qty: { type: 'integer' },
            },
            required: ['product_id', 'qty'],
          },
        },
        payment_method: { type: 'string', enum: ['cash', 'card', 'transfer'] },
        bank: { type: 'string', enum: ['TBC', 'BOG'] },
        tip: { type: 'number' },
        session_id: { type: 'string', description: 'ღია სესიას მიება (არასავალდებულო)' },
      },
      required: ['items', 'payment_method'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool execution — all run as the caller (RLS enforced). `venueId` is resolved
// per request from the user's first accessible venue unless the model targets one.
// ---------------------------------------------------------------------------
async function runTool(
  db: SupabaseClient,
  venueId: string | null,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_overview': {
      const { data, error } = await db
        .from('consoles')
        .select('id, name, status, deleted_at')
        .is('deleted_at', null)
      if (error) throw error
      const active = (data ?? []).filter((c) => c.status === 'active').length
      const expiring = (data ?? []).filter(
        (c) => c.status === 'warning_5' || c.status === 'expired',
      ).length
      return {
        total_consoles: data?.length ?? 0,
        active,
        free: (data?.length ?? 0) - active,
        expiring,
      }
    }
    case 'list_consoles': {
      const { data, error } = await db
        .from('consoles')
        .select('id, name, slot_number, status, sessions(id, customer_name, ends_at, status)')
        .is('deleted_at', null)
        .order('slot_number')
      if (error) throw error
      return data
    }
    case 'list_plans': {
      const { data, error } = await db
        .from('pricing_plans')
        .select('id, name, price_per_hour, controllers, is_active')
        .eq('is_active', true)
      if (error) throw error
      return data
    }
    case 'list_bar_products': {
      const { data, error } = await db
        .from('bar_products')
        .select('id, name, price, stock_quantity, is_active')
        .eq('is_active', true)
      if (error) throw error
      return data
    }
    case 'get_revenue_summary': {
      if (!venueId) return { error: 'venue not found' }
      const today = new Date().toISOString().slice(0, 10)
      const from = (args.from as string) ?? today
      const to = (args.to as string) ?? today
      const { data, error } = await db.rpc('get_venue_pnl', {
        p_venue_id: venueId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return data
    }
    case 'start_session': {
      const { data, error } = await db.rpc('start_session', {
        p_console_id: args.console_id,
        p_plan_id: args.plan_id,
        p_duration_min: args.duration_min,
        p_customer_name: args.customer_name ?? null,
        p_payment_method: args.payment_method,
        p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null),
      })
      if (error) throw error
      return data
    }
    case 'end_session': {
      const { error } = await db.rpc('end_session', {
        p_session_id: args.session_id,
        p_tip: args.tip ?? 0,
      })
      if (error) throw error
      return { ok: true }
    }
    case 'create_bar_sale': {
      if (!venueId) return { error: 'venue not found' }
      const { data, error } = await db.rpc('create_bar_sale', {
        p_venue_id: venueId,
        p_payment_method: args.payment_method,
        p_items: args.items,
        p_bank: args.payment_method === 'cash' ? null : (args.bank ?? null),
        p_session_id: args.session_id ?? null,
        p_tip: args.tip ?? 0,
      })
      if (error) throw error
      return { sale_id: data }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------
async function callGemini(systemPrompt: string, contents: unknown[]) {
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
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini ${res.status}: ${t}`)
  }
  return await res.json()
}

function systemPrompt(role: string, isPlatformAdmin: boolean): string {
  return `შენ ხარ "Playroom"-ის ადმინ პანელის AI დამხმარე. პასუხობ ქართულად, მოკლედ და გასაგებად.

პანელის მოდულები:
- მთავარი (Dashboard): კონსოლები ბარათებად. "სესიის დაწყება" — ახალი თამაში; "გაგრძელება" — დროის დამატება; "დასრულება" — სესიის დახურვა + ჩაიანი. ბარათები ნეონით ანათებენ: ლურჯი=ნორმა, ნარინჯი=≤10წთ, წითელი=≤5წთ/ამოწურული.
- ბარი (POS): პროდუქტებზე დაჭერით კალათაში დაამატებ, "გადახდა" ასრულებს გაყიდვას. შეიძლება ღია სესიას მიება.
- კასა: ცვლის გახსნა/დახურვა, შემოსავლის დაშლა მეთოდებით (ნაღდი/ბარათი/გადარიცხვა), Z-რეპორტი.
- ისტორია, ტარიფები, საწყობი, კლიენტები, თანამშრომლები, პარამეტრები, გამოწერა, ბუღალტერია, ჯავშნები.
${isPlatformAdmin ? '- პლატფორმა (GOD MODE): ყველა ორგანიზაცია, შეჩერება/გააქტიურება, "ნახვა".' : ''}

მომხმარებლის როლი: ${role}${isPlatformAdmin ? ' + PLATFORM ADMIN (სრული წვდომა ყველა ორგანიზაციაზე)' : ''}.

წესები:
- მონაცემებზე კითხვაზე ჯერ გამოიძახე შესაბამისი read-ფუნქცია, მერე უპასუხე.
- მოქმედებამდე (სესია/გაყიდვა) აუცილებლად მოიძიე საჭირო id-ები (list_consoles, list_plans, list_bar_products).
- არასდროს გამოიგონო id ან მონაცემი. თუ რამე გაუგებარია — ჰკითხე მომხმარებელს.
- მოქმედებებს დადასტურება სჭირდება — ეს ავტომატურად ხდება, შენ უბრალოდ გამოიძახე ფუნქცია.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY not configured' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  // user-scoped client: RLS applies as this user
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: auth } = await db.auth.getUser()
  if (!auth?.user) return json({ error: 'unauthorized' }, 401)

  // role + platform-admin + a venue to target for venue-scoped tools
  const [{ data: member }, { data: isPlat }, { data: venues }] = await Promise.all([
    db.from('org_members').select('role').limit(1).maybeSingle(),
    db.rpc('is_platform_admin'),
    db.from('venues').select('id').limit(1),
  ])
  const role = member?.role ?? 'guest'
  const isPlatformAdmin = isPlat === true
  const venueId = venues?.[0]?.id ?? null

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

  // ---- Path A: execute a user-confirmed action, then summarize ----
  if (body.confirmedAction) {
    const { name, args } = body.confirmedAction
    if (!WRITE_TOOLS.has(name)) return json({ error: 'not a confirmable action' }, 400)
    try {
      const result = await runTool(db, venueId, name, args)
      const contents = [
        ...(body.messages ?? []).map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        })),
        {
          role: 'user',
          parts: [
            {
              text: `მოქმედება "${name}" შესრულდა. შედეგი: ${JSON.stringify(result)}. დაუდასტურე მომხმარებელს მოკლედ ქართულად.`,
            },
          ],
        },
      ]
      const g = await callGemini(sys, contents)
      const text =
        g?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)
          ?.text ?? 'მზადაა ✅'
      return json({ type: 'text', text })
    } catch (e) {
      return json({ type: 'error', text: `ვერ შესრულდა: ${(e as Error).message}` })
    }
  }

  // ---- Path B: agent loop (read tools run server-side; write tools → confirm) ----
  const contents: unknown[] = (body.messages ?? []).map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }))

  try {
    for (let hop = 0; hop < 6; hop++) {
      const g = await callGemini(sys, contents)
      const parts = g?.candidates?.[0]?.content?.parts ?? []
      const fnCall = parts.find(
        (p: { functionCall?: unknown }) => p.functionCall,
      )?.functionCall as { name: string; args: Record<string, unknown> } | undefined

      if (!fnCall) {
        const text =
          parts.find((p: { text?: string }) => p.text)?.text ?? '...'
        return json({ type: 'text', text })
      }

      // write tool → ask the UI to confirm
      if (WRITE_TOOLS.has(fnCall.name)) {
        return json({
          type: 'confirm',
          action: { name: fnCall.name, args: fnCall.args ?? {} },
          messages: body.messages ?? [],
        })
      }

      // read tool → execute and feed back to the model
      if (READ_TOOLS.has(fnCall.name)) {
        let result: unknown
        try {
          result = await runTool(db, venueId, fnCall.name, fnCall.args ?? {})
        } catch (e) {
          result = { error: (e as Error).message }
        }
        contents.push({ role: 'model', parts: [{ functionCall: fnCall }] })
        contents.push({
          role: 'user',
          parts: [
            { functionResponse: { name: fnCall.name, response: { result } } },
          ],
        })
        continue
      }

      return json({ type: 'text', text: 'უცნობი ფუნქცია.' })
    }
    return json({ type: 'text', text: 'ვერ დავასრულე — სცადე უფრო კონკრეტულად.' })
  } catch (e) {
    return json({ type: 'error', text: (e as Error).message }, 500)
  }
})
