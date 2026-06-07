# Playroom OS — Project Overview

> Multi-tenant SaaS admin panel for Georgian entertainment venues (PS5 lounges, bars).
> Built to replace the Excel sheets these businesses use today.
> Landing page: **runabe.com** (external). Signup + org creation lives in this app.
> Deployed as a static export to **Cloudflare Pages → playroom-ps5.pages.dev** (push to `main`).

This document is the single source of truth for anyone (human or AI) joining the
project. **Backend = Claude (Supabase/DB/RLS/RPC/edge functions). Frontend = Gemini / Sonnet.**

---

## 1. Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (strict)
- `output: 'export'` — pure **static** export (no server runtime); hosted on Cloudflare Pages
- **Tailwind CSS v4** (CSS-first, `@theme` in `app/globals.css`) + custom neumorphic utilities
- **lucide-react** icons
- **Supabase** — Postgres + Auth + Realtime + **Edge Functions** (project ref `rvlkimzqzwizcivkxtnd`)
- `@supabase/supabase-js` browser client (app is fully client-side, `'use client'`)
- **AI assistant** — `ai-assistant` Supabase Edge Function (Deno) proxying **Gemini** (function-calling agent)
- Package manager: **npm**. Verify with `npm run build` and `npx tsc --noEmit`.

---

## 2. Three-layer architecture

```
PLATFORM (God Mode)           platform_admins — all tenants, MRR, plan/suspend, impersonate
   └── ORGANIZATION (tenant)  organizations + org_members(role) + billing/plan
          └── VENUE (filiali) venues — consoles, sessions, bar/POS, cashier, fiscal
```

- **Multi-tenancy:** every domain row has `org_id` (+ `venue_id` where venue-specific).
  Isolation enforced by **RLS** via SECURITY DEFINER helpers:
  `is_org_member(org)` / `is_org_admin(org)` (both **suspension-aware** — deny if
  `subscription_status='canceled'`), `is_org_member_raw(org)` (membership only, for
  visibility reads), `is_platform_admin()`.
- **Auth:** Supabase Auth (email/password). After login, `OrgProvider` loads memberships + venues.
  No membership → onboarding (`create_organization` RPC). Suspended org → `Suspended` lock screen.
- Founder `j19mt85@gmail.com` auto-gets platform_admin + owner of "Playroom (Demo)" org
  via `trg_bootstrap_founder` trigger on signup.
- **Impersonation (God Mode):** platform admin calls `setCurrentOrg(id)` → RLS allows via
  `is_platform_admin()`. Amber `ImpersonationBar` shows it. No minted tenant token — audit is clean.

---

## 3. Directory map

```
app/
  globals.css            # Tailwind v4 @theme + neumorphic utils + keyframes (neon pulse, slide-in)
  layout.tsx             # fonts (Noto Sans Georgian), dark theme
  page.tsx               # <AdminShell/>

components/admin/
  admin-shell.tsx        # auth gate → OrgProvider → (Splash|Onboarding|Suspended|Workspace)
                         # mounts <AiAssistant/>; ImpersonationBar (amber God Mode banner)
  login.tsx              # sign-in + sign-up
  onboarding.tsx         # create_organization RPC
  venue-switcher.tsx     # topbar venue dropdown
  sidebar.tsx            # nav; mobile = hidden slide-in drawer (hamburger), desktop = static
  topbar.tsx             # hamburger (mobile) + title/subtitle + bell badge (expiring consoles)
  dashboard.tsx          # consoles grid w/ neon pulse, count-up timers, StartSessionModal
                         # (fixed OR open session, payment+bank, fiscal receipt on end), Analytics
  pos.tsx                # Bar POS: product grid (big photos), cart, barcode, fiscal/regular receipt
  cashier.tsx            # period revenue (sessions + bar) + payment-channel breakdown + Z-report + shifts
  history.tsx            # completed sessions log
  pricing.tsx            # tariff management: edit price, toggle, ADD new tariff, DELETE tariff
  inventory.tsx          # bar_products + bar_categories CRUD (+ delete buttons)
  customers.tsx          # customer loyalty: points, visits, discounts
  employees.tsx          # clock-in/out, shifts journal
  settings.tsx           # general settings + console management + fiscal settings toggle
  accounting.tsx         # P&L, expenses, financial reports (UI live)
  reservations.tsx       # console pre-booking (UI live)
  platform.tsx           # God Mode: tenant list, MRR, plan/suspend, view-as impersonation
  billing.tsx            # tenant billing: plan, trial countdown, comparison, upgrade CTA
  analytics.tsx          # monthly profit bars + hourly heatmap (custom CSS/SVG, animated)
  ai-assistant.tsx       # floating ✨ chat widget: text + voice (ka-GE), confirm-gated actions
  modal.tsx              # createPortal to <body> (escapes transformed ancestors)
  toast.tsx

lib/
  supabase/client.ts     # browser Supabase client
  database.types.ts      # generated types — regenerate after every migration
  types.ts               # domain types: ConsoleUnit, Session (is_open, nullable ends_at/duration_min)…
  org.tsx                # OrgProvider/useOrg — org/venue/role/isPlatformAdmin/impersonating/suspended
  store.tsx              # PlayroomProvider/usePlayroom — consoles, sessions, plans, actions
  hooks.ts               # useCountUp (numbers animate 0→target), use3dTilt (perspective hover)
  ui.ts                  # gel(), statusMeta, paymentMethodLabel, openBillableMinutes(), date helpers
  notify.ts              # Web Audio alerts
  print.ts               # printReceipt() + printKitchenTicket() — 80mm thermal via window.print()
  fiscal.ts              # useFiscal() hook + printFiscalReceipt() — RS.GE Phase B (PDF/print)

supabase/functions/
  ai-assistant/index.ts  # Deno edge fn: Gemini function-calling agent (see §11). Runs as caller's JWT.

supabase/migrations/     # see §3.1
```

### 3.1 Migrations (apply in order)

```
0001  initial schema
0002  pgcrypto search_path fix + FK indexes
0003  multi-tenant (orgs/venues/members/platform_admins + org_id on all + RLS overhaul)
0004  per-venue slot_number unique
0005  sessions.payment_method + bank + updated start_session
0006  bar POS (bar_categories, bar_products, bar_sales, bar_sale_items, create_bar_sale)
0007  inventory expansion (barcode, image_url, stock, cost_price, session_id, customers)
0008  platform_org_overview view (security_invoker)
0009  fiscal_enabled/tin/business_name/address on venues + next_fiscal_receipt_no()
0010  audit_logs + log_audit() + triggers (session/bar_sale/shift/venue)
0011  void_bar_sale() + refund_session() (role-gated, stock rollback)
0012  composite/partial performance indexes
0013  expenses + add_expense/delete_expense + get_venue_pnl() + monthly_pnl view
0014  reservations + create/confirm/cancel_reservation()
0015  tip_amount on sessions + bar_sales; end_session(p_tip?), create_bar_sale(p_tip?)
0016  soft delete (deleted_at) on consoles + customers; delete_console/delete_customer RPCs
0017  suspension enforcement: is_org_member_raw; is_org_member/is_org_admin now deny canceled orgs;
      visibility policies use raw; delete RPCs add suspension guard
0018  fix create_bar_sale — add org_id to bar_sale_items INSERT (NOT NULL was violated)
0019  OPEN (pay-as-you-go) sessions: sessions.is_open + nullable ends_at/duration_min;
      start_open_session() RPC; end_session computes open price (elapsed → round up 5 min, min 5);
      Pro tier (3 controllers ₾7) seeded per org; pricing_plans.type relaxed to
      standard|pro|premium|custom; create_organization seeds all 3 tiers
```

---

## 4. Design system (MATCH THIS)

Dark neumorphic. Use these utilities (defined in `globals.css`), **not raw shadows:**

| Class | Use |
|---|---|
| `nm-raised` / `nm-raised-sm` | extruded surface — cards, panels |
| `nm-inset` | pressed/inset — inputs, wells, icon chips |
| `nm-btn` | interactive button — lifts hover, presses active |
| `nm-daylight` | glowing selected state — active tab, chosen option |
| `nm-neon-blue/orange/red` | console-card neon pulse by status (active / ≤10min / ≤5min·expired) |
| `text-glow` | primary color text glow |

- Radii: `rounded-2xl` / `rounded-3xl`. Icons: lucide `size-4`/`size-5`.
- Colors: `text-primary`, `text-muted-foreground`, `var(--status-free/active/warning10/warning5/expired)`, `var(--surface-2)`.
- Money: `gel(n)` from `@/lib/ui` — honors `settings.currency`.
- Animations: `useCountUp` / `use3dTilt` (`lib/hooks.ts`); `slide-in-up` stagger for grids.
- **All UI text is Georgian (ka).** Match the existing tone and vocabulary.
- **Mobile:** sidebar is a hidden drawer (hamburger in topbar opens it; tap-outside/select closes).

---

## 5. State management

```typescript
useOrg()       → currentOrgId, currentVenueId, venues, currentRole, isPlatformAdmin,
                 impersonating, suspended, orgs, memberOrgIds,
                 setCurrentOrg, setCurrentVenue, stopImpersonating, refresh

usePlayroom()  → consoles, plans, employees, shifts, completed, settings, toasts
                 + startSession, startOpenSession, extendSession, endSession,
                   updatePlanPrice, togglePlanActive, addPlan, removePlan,
                   addConsole, renameConsole, removeConsole, clockToggle,
                   refreshLive, pushToast, tick…

useFiscal()    → fiscalEnabled, fiscalSettings, saveFiscalSettings,
                 issueReceipt(items, total, method)
```

- Every query in `usePlayroom` is scoped to `currentVenueId` / `currentOrgId`.
- Mutations go through **RPCs** (server computes totals — never trust the client),
  except plan add/delete which are direct `pricing_plans` writes (RLS-guarded).
- Realtime on `consoles` / `sessions` triggers debounced refetch.

---

## 6. Data model

### Core tables
| Table | Key columns |
|---|---|
| `organizations` | id, name, plan, subscription_status, trial_ends_at |
| `venues` | id, org_id, name, is_active, **fiscal_enabled, fiscal_tin, fiscal_business_name, fiscal_address** |
| `org_members` | org_id, user_id, role (owner/admin/manager/cashier/operator) |
| `platform_admins` | user_id |

### Gaming
| Table | Key columns |
|---|---|
| `consoles` | id, org_id, venue_id, slot_number, name, status, deleted_at |
| `sessions` | id, org_id, venue_id, console_id, pricing_plan_id, payment_method, bank, price_total, **is_open**, ends_at (nullable), duration_min (nullable), tip_amount, status |
| `session_extensions` | session_id, extra_minutes, extra_price |
| `pricing_plans` | id, org_id, name, type (standard/pro/premium/custom), price_per_hour, controllers |
| `employees` | id, org_id, name, role (admin/operator), pin_hash |
| `shifts` | id, org_id, venue_id, employee_id, clock_in, clock_out, hours_worked |

### Bar / POS
| Table | Key columns |
|---|---|
| `bar_categories` | id, org_id, name, parent_id, sort_order |
| `bar_products` | id, org_id, category_id, name, price, cost_price, stock_quantity, low_stock_threshold, barcode, image_url |
| `bar_sales` | id, org_id, venue_id, payment_method, bank, total, tip_amount, session_id, voided_at |
| `bar_sale_items` | sale_id, **org_id**, product_id, name, qty, unit_price, unit_cost_price, line_total |

### Customers / Accounting / Reservations / Audit
| Table | Key columns |
|---|---|
| `customers` | id, org_id, name, phone, points, visit_count, total_spent, discount_pct, deleted_at |
| `expenses` | id, org_id, venue_id, category, amount, description, expense_date |
| `reservations` | id, org_id, venue_id, console_id, customer_name, customer_phone, start_time, duration_min, status, session_id |
| `audit_logs` | id, org_id, venue_id, actor_id, actor_email, action, entity_type, entity_id (text), payload (jsonb), created_at |

Expense categories: rent/salary/utilities/supplies/marketing/maintenance/other.
Audit actions auto-logged via triggers: session.start/end/extend, bar_sale.create, employee.clock_in/out, fiscal.enable/disable, venue.rename, etc.

### Views (security_invoker)
`session_revenue`, `console_stats`, `daily_revenue`, `period_revenue`, `monthly_pnl`, `platform_org_overview`

### RPCs
`start_session`, `start_open_session`, `extend_session`, `end_session(p_tip?)`,
`clock_toggle(pin, venue_id)`, `set_employee_pin`, `create_organization`,
`create_bar_sale(…, p_tip?)`, `void_bar_sale`, `refund_session`,
`add_expense`, `delete_expense`, `get_venue_pnl(venue, from, to)` → jsonb,
`create_reservation`, `confirm_reservation`, `cancel_reservation`,
`delete_console`, `delete_customer`, `next_fiscal_receipt_no()` → `GE-YYYYMMDD-XXXXXX`,
`log_audit()` (SECURITY DEFINER, triggers only),
`is_org_member`, `is_org_member_raw`, `is_org_admin`, `is_platform_admin`

### Sessions: fixed vs open
- **Fixed** — preset `duration_min`; price = duration × rate up front; countdown + warning neon.
- **Open (pay-as-you-go)** — `is_open=true`, no ends_at; card counts UP with live cost;
  `end_session` bills elapsed time **rounded up to nearest 5 min (min 5)**. UI mirror:
  `openBillableMinutes()` in `lib/ui.ts` (must match the RPC).

### Payment channel (shared everywhere money is taken)
`payment_method ∈ {cash, card, transfer}`, `bank ∈ {TBC, BOG}` (null iff cash).
On `sessions` and `bar_sales`. Shown in modals + cashier; feeds accounting.

---

## 7. Modules & Status

| Module | Key | Status |
|---|---|---|
| Dashboard (consoles grid, fixed + open sessions) | `dashboard` | ✅ |
| Bar POS | `pos` | ✅ |
| Cashier (sessions + bar revenue) | `cashier` | ✅ |
| Session history | `history` | ✅ |
| Pricing (edit + add + delete tariffs) | `pricing` | ✅ |
| Inventory (products + categories + delete) | `inventory` | ✅ |
| Customers (loyalty/points) | `customers` | ✅ |
| Employees (clock-in/out) | `employees` | ✅ |
| Settings + fiscal toggle | `settings` | ✅ |
| Accounting (expenses + P&L) | `accounting` | ✅ |
| Reservations | `reservations` | ✅ |
| Analytics (charts + heatmap) | inside `dashboard` | ✅ |
| Platform God Mode | `platform` | ✅ |
| Billing (plan/trial/upgrade) | `billing` | ✅ |
| AI assistant (Gemini, voice, actions) | `ai-assistant` | ✅ |
| Suspension enforcement | RLS + `Suspended` screen | ✅ |
| RS.GE Fiscal — Phase B (PDF) | `lib/fiscal.ts` | ✅ |
| Audit Log | `audit_logs` | ✅ |
| Refund / Void | RPCs | ✅ |
| RS.GE Fiscal — Phase C (hardware bridge) | — | 🔲 |
| Auto-billing (TBC Pay / BOG) | — | 🔲 |
| RBAC + PIN gate + payroll + Excel | — | 🔲 (next, see §12) |

---

## 8. AI assistant — architecture

```
Client (ai-assistant.tsx)  →  supabase.functions.invoke('ai-assistant', {messages})
   →  Edge fn runs Gemini with the CALLER's JWT  →  RLS/roles/suspension all apply
   →  Read tools execute server-side; WRITE tools return {type:'confirm'} for UI approval
   →  User confirms  →  callback {confirmedAction}  →  tool runs  →  summary
```

- **Security:** built from the caller's JWT — the AI can never exceed the user's own rights.
  Platform admins get cross-tenant reach automatically. **No service_role.**
- **Tools:** read (overview, consoles, plans, products, customers, sales, sessions, employees,
  reservations, expenses, revenue) + write (start_session, start_open_session, end_session,
  create_bar_sale, restock_product) — writes are confirm-gated.
- **Models:** fallback chain `gemini-2.5-flash → 2.0-flash → 2.5-flash-lite`; retry on 429/503.
  **Thinking disabled** (`thinkingBudget:0`) on 2.5.* models — otherwise they burn the output
  budget on hidden thoughts and return an empty candidate.
- `GEMINI_API_KEY` lives ONLY as a Supabase secret, from a **fresh** GCP project (the original
  was 403-blocked). Never client-side, never in git.
- **Deploy:** see `memory/edge-function-deploy.md` — CLI with the User `SUPABASE_ACCESS_TOKEN`,
  `supabase functions deploy ai-assistant --project-ref rvlkimzqzwizcivkxtnd --use-api`.

---

## 9. RS.GE Fiscal — Architecture

```
Phase B (current):  App → issueReceipt() → window.print() 80mm popup
Phase C (future):   App → issueReceipt() → localhost:3434 Bridge Agent
                                          → Daisy/EFTS USB register → RS.GE GPRS

Toggle:  venues.fiscal_enabled (per-venue, default false)
  OFF → printReceipt() (ჩვეულებრივი ჩეკი)  |  POS + session end
  ON  → issueReceipt() (ფისკალური ჩეკი)    |  POS + session end

Receipt no: next_fiscal_receipt_no() → "GE-20260606-001000"
```

---

## 10. Billing & Plans

| Plan | Price | Limits |
|---|---|---|
| trial | ₾0 | 1 venue, 4 consoles, 3 employees, 14 days |
| pro | ₾99/mo | 3 venues, 8 consoles/venue, unlimited employees + bar + inventory |
| enterprise | ₾299/mo | unlimited + RS.GE fiscal + API + priority support |

Upgrade flow: **manual/invoice** (WhatsApp CTA). Platform admin changes plan in God Mode.
Auto-billing (TBC Pay) — future.

---

## 11. Working agreement

| Who | Owns |
|---|---|
| **Claude** | `supabase/migrations/*`, DB schema, RLS, RPCs, edge functions, `lib/database.types.ts`, `lib/store.tsx`, `lib/org.tsx`, `lib/fiscal.ts`, security-sensitive backend |
| **Gemini / Sonnet** | UI components, layout, styling, client interactions, non-security frontend |

**Rules:**
- Never change DB/RLS/migrations from the frontend side — request it from Claude.
- Keep `payment_method` / `bank` enum identical across all modules.
- Keep `npm run build` + `npx tsc --noEmit` green before handing off.
- Regenerate `lib/database.types.ts` after every migration.
- Never expose `service_role` key client-side — only the publishable key.
- `issueReceipt()` is the single entry point for receipt printing when fiscal is on.
- After a DB change, keep the open-session rounding in sync between `end_session` and `openBillableMinutes()`.

---

## 12. Next phase (planned — see `memory/roadmap-rbac-payroll.md`)

1. **RBAC + PIN gate on load** — PIN entered before the panel loads; app identifies the
   employee and opens that role's dashboard. Roles: **operator** (sessions + bar),
   **accountant** (accounting only — new role), **owner/admin** (full). Build on existing
   `employees.pin_hash` + a new "identify by PIN" RPC (never expose the hash).
2. **Employee profiles + salaries** → flow into accounting as `expenses` (category 'salary').
3. **Excel import/export** — accountant + owner full download/upload (client-side xlsx, static build).
