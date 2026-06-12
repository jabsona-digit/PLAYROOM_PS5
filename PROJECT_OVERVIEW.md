# Martelounge — Project Overview

> **Martelounge** is a multi-tenant SaaS for Georgian PlayStation lounges & gaming bars
> **plus** a public consumer marketplace where customers find venues and book PS5 time online.
> Built to replace the Excel sheets these businesses run today.
>
> - **Admin panel** (this repo, `playroom-admin-panel`) → **https://martelounge.ge** (Cloudflare Pages, static export)
> - **Marketplace** (separate repo, `martelounge-web`) → **https://play.martelounge.ge** (Cloudflare Worker, Next SSR via OpenNext)
> - **Media CDN** → **https://cdn.martelounge.ge** (Cloudflare R2)
> - Both apps share ONE Supabase project: **`rvlkimzqzwizcivkxtnd`**.

This document is the single source of truth for anyone (human or AI) joining the project.
**Backend = Claude (Supabase/DB/RLS/RPC/edge functions). Frontend = Gemini / Sonnet / Claude.**

> Product was renamed **Playroom OS → Martelounge** (martel-**OU**-nge; domain bought 2026-06-08).
> "Playroom" survives only as a demo/tenant name.

---

## 1. The two apps + infrastructure

```
                         ┌─────────────────────────────────────────┐
                         │      Supabase  rvlkimzqzwizcivkxtnd      │
   martelounge.ge        │   Postgres + Auth + Realtime + Edge fns  │       play.martelounge.ge
  ┌──────────────┐  RLS  │                                          │  RLS  ┌──────────────────┐
  │ ADMIN PANEL  │◀─────▶│  org-scoped (staff)  │  public views/RPC │◀─────▶│   MARKETPLACE    │
  │ (this repo)  │       │  is_org_member()     │  (anon/customer)  │       │ (martelounge-web)│
  │ Next static  │       └─────────────────────────────────────────┘       │ Next SSR/OpenNext│
  │ Cloudflare   │                         ▲                               │ Cloudflare Worker│
  │ Pages        │            /api/upload   │  cdn.martelounge.ge           │                  │
  └──────────────┘                  ┌───────┴────────┐                      └──────────────────┘
                                    │ Cloudflare R2  │  bucket martelounge-media
                                    └────────────────┘
```

| | Admin panel | Marketplace |
|---|---|---|
| Repo | `playroom-admin-panel` (this) | `martelounge-web` (sibling on Desktop; no GitHub remote) |
| Domain | `martelounge.ge` (+ www) | `play.martelounge.ge` |
| Rendering | `output: 'export'` — pure **static** SPA | **SSR** (SEO) via `@opennextjs/cloudflare` |
| Host | Cloudflare **Pages** (project `playroom-ps5`) | Cloudflare **Worker** |
| Deploy | push `main` → GitHub `jabsona-digit/PLAYROOM_PS5` → Pages auto-build (`npm run build` → `out`) | `npm run deploy` (wrangler, from the machine) |
| Supabase access | staff session, org-scoped RLS | anon + customer session, public views/RPCs |
| Audience | venue owners & staff | end customers (players) |

**Media:** product/venue images go to **Cloudflare R2** (NOT Supabase Storage). Upload via the admin's
`functions/api/upload.js` Pages Function (verifies the Supabase JWT, writes to R2 binding `MEDIA`,
returns a `cdn.martelounge.ge/...` URL). Client-side WebP optimisation (≤1200px, q0.82) before upload.
See `memory/media-r2-uploads.md`.

---

## 2. Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict) — both apps
- **Tailwind CSS v4** (CSS-first `@theme`) + shared dark **neumorphic** design system, Georgian UI
- **lucide-react** icons
- **Supabase** — Postgres + Auth + Realtime + **Edge Functions** + RLS
- Admin: `@supabase/supabase-js` browser client (fully client-side `'use client'`), Turbopack build
- Marketplace: `@supabase/ssr` (cookie auth, server + browser clients), **`next build --webpack`**
  (OpenNext can't bundle Turbopack output), no `proxy`/middleware (Next-16 proxy is Node-only,
  unsupported on Cloudflare edge — the browser client refreshes tokens instead)
- **qrcode.react** (marketplace QR pass), **@zxing/browser** (admin camera scanner), **xlsx** (Excel)
- **AI assistant** — `ai-assistant` Supabase Edge Function (Deno) proxying **Gemini** (function-calling)
- Package manager: **npm**. Admin verify: `npm run build` **and `npx tsc --noEmit`**
  (admin `next.config.mjs` has `typescript.ignoreBuildErrors:true`, so `next build` skips type-check —
  always run `tsc` separately). Marketplace verify: `next build --webpack` (it does type-check).

---

## 3. Multi-tenancy, RBAC & auth

```
PLATFORM (God Mode)           platform_admins — all tenants, MRR, plan/suspend, impersonate
   └── ORGANIZATION (tenant)  organizations + org_members(role) + billing/plan + identification_code
          └── VENUE (filiali) venues — consoles, sessions, bar/POS, cashier, fiscal, marketplace profile
```

- **Isolation:** every domain row has `org_id` (+ `venue_id` where venue-specific), enforced by **RLS**
  via SECURITY DEFINER helpers:
  - `is_org_member(org)` / `is_org_admin(org)` / `is_org_accountant(org)` — **suspension-aware** (deny if
    `subscription_status='canceled'`)
  - `is_org_member_raw(org)` — membership only, for visibility reads
  - `is_platform_admin()`
- **Roles (6):** `owner`, `admin`, `manager`, `cashier`, `operator`, `accountant`.
  Per-module access is `MODULE_ROLES` in `lib/org.tsx`; `useModuleAccess(key)` gates the UI,
  `firstAllowedModule(role)` picks a landing module (e.g. accountant → accounting).
- **PIN gate:** if an org has employees, the terminal is PIN-locked (`PinGate`). `identify_by_pin(pin)`
  RPC (migration 0022) matches the PIN hash and returns the employee + role — never exposes the hash.
  Owner/admin can "enter as owner" to bypass.
- **Auth:** Supabase Auth (email/password). `OrgProvider` loads memberships + venues. No membership →
  onboarding wizard. Suspended org → `Suspended` lock screen.
- **Impersonation (God Mode):** platform admin `setCurrentOrg(id)` → RLS allows via `is_platform_admin()`;
  amber `ImpersonationBar` shows it. No minted tenant token — audit stays clean.

> Reminder: use `is_org_member`/`is_org_admin` (suspension-aware) for **operational** access;
> `is_org_member_raw` only for **visibility** reads. New role-lookup RPCs need a suspension guard.
> See `memory/suspension-enforcement.md`.

---

## 4. Admin panel — directory & modules

```
app/                    globals.css (theme+neumorphic), layout.tsx (Noto Sans Georgian), page.tsx → <AdminShell/>
functions/api/upload.js Cloudflare Pages Function — POST /api/upload → R2 (verifies Supabase JWT)
components/admin/
  admin-shell.tsx       auth gate → OrgProvider → (Splash|Onboarding|Suspended|PinGate|Workspace)
                        wraps content in <BookingAlertsProvider/>; mounts <AiAssistant/>, ImpersonationBar
  login.tsx             sign-in + sign-up
  onboarding.tsx        multi-step wizard: org + identification_code + employees/PINs (+ skip)
  pin-gate.tsx          PIN entry → identify_by_pin → role
  venue-switcher.tsx    topbar venue dropdown
  sidebar.tsx           role-gated nav (mobile = slide-in drawer)
  topbar.tsx            title/subtitle + venue switcher + BELL (live online-booking badge, see §10)
  dashboard.tsx         consoles grid (neon pulse, count-up), StartSessionModal (fixed/open, pay+bank,
                        fiscal receipt on end), embedded Analytics
  pos.tsx               Bar POS: product grid (R2 photos), cart, barcode, fiscal/regular receipt; default cat "ყველა"
  cashier.tsx           period revenue (sessions + bar) + payment-channel breakdown + Z-report + shifts
  history.tsx           completed sessions log
  pricing.tsx           tariffs: edit price, toggle, add, delete
  inventory.tsx         bar_products + bar_categories CRUD; image upload to R2 (optimised WebP)
  customers.tsx         loyalty: points, visits, discounts
  employees.tsx         CRUD + role + salary + PIN (create_employee); clock-in/out shifts
  settings.tsx          general + console mgmt + FiscalSettings (fiscal + VAT toggle) + <MarketplaceSettings/>
  marketplace-settings.tsx  venue PUBLIC profile editor: slug, description, city/address, public_phone,
                        cover + gallery (R2 folder=venues), amenities, is_published toggle, link to play.martelounge.ge/<slug>
  accounting.tsx        Accounting v2: P&L, VAT summary, budgets, invoices (A4 print), payroll, expenses
  invoice-print.tsx     A4 invoice print layout
  reservations.tsx      internal console pre-booking (staff)
  online-bookings.tsx   NEW: marketplace bookings inbox — confirm / mark-paid / complete / no-show / cancel,
                        status filters + pending counter, "📷 სკანირება" → camera → verify QR → check-in
  booking-alerts.tsx    BookingAlertsProvider + useBookingAlerts — Realtime + poll → topbar bell badge
  barcode-scanner.tsx   @zxing camera scanner Modal {open,onClose,onScan} (QR + barcodes)
  platform.tsx          God Mode: tenant list, MRR, plan/suspend, view-as
  billing.tsx           tenant billing: plan, trial countdown, upgrade CTA
  analytics.tsx         monthly profit bars + hourly heatmap (CSS/SVG)
  ai-assistant.tsx      floating ✨ chat: text + voice (ka-GE), confirm-gated actions
  modal.tsx / toast.tsx
lib/
  supabase/client.ts    browser Supabase client
  database.types.ts     generated types — regenerated by CI on migration push (gen-types.yml)
  types.ts              ModuleKey, OrgRole, ConsoleUnit, Session…
  org.tsx               OrgProvider/useOrg + MODULE_ROLES + useModuleAccess + firstAllowedModule
  store.tsx             PlayroomProvider/usePlayroom — consoles, sessions, plans, settings, actions
  fiscal.ts             useFiscal() + printFiscalReceipt() (RS.GE Phase B)
  upload.ts             optimizeImage() + uploadImage(file, folder) + slugify() — shared R2 upload helper
  ui.ts / hooks.ts / notify.ts / print.ts
supabase/functions/ai-assistant/index.ts   Gemini function-calling agent (runs as caller's JWT)
supabase/migrations/    0001–0036 (see §7)
```

### Modules & status

| Module | Key | Roles (MODULE_ROLES) | Status |
|---|---|---|---|
| Dashboard (consoles, fixed+open sessions, analytics) | `dashboard` | owner/admin/manager/cashier/operator | ✅ |
| Bar POS | `pos` | owner/admin/manager/cashier/operator | ✅ |
| Cashier (sessions + bar revenue, Z-report) | `cashier` | owner/admin/manager/accountant/cashier | ✅ |
| Accounting v2 (P&L, VAT, budgets, invoices, payroll) | `accounting` | owner/admin/accountant | ✅ |
| History | `history` | owner/admin/manager/cashier | ✅ |
| Pricing (tariffs) | `pricing` | owner/admin | ✅ |
| Inventory (products/categories, R2 photos) | `inventory` | owner/admin/manager | ✅ |
| Customers (loyalty) | `customers` | owner/admin/manager/cashier | ✅ |
| Employees (CRUD + salary + PIN + clock) | `employees` | owner/admin | ✅ |
| Settings (+ fiscal/VAT + marketplace publish) | `settings` | owner/admin | ✅ |
| Reservations (internal) | `reservations` | owner/admin/manager/cashier | ✅ |
| **Online bookings (marketplace inbox + QR check-in)** | `online_bookings` | owner/admin/manager/cashier | ✅ |
| Platform God Mode | `platform` | platform_admins | ✅ |
| Billing | `billing` | owner | ✅ |
| AI assistant (Gemini, voice, actions) | `ai-assistant` | all | ✅ |

> **Adding a module touches 6 places** (types, org MODULE_ROLES + MODULE_ORDER, sidebar NAV, admin-shell render,
> topbar TITLES). A missing topbar `TITLES` key crashes the page. See `memory/admin-module-registration.md`.

---

## 5. Marketplace (`martelounge-web`)

Separate Next 16 SSR app (`@supabase/ssr`, OpenNext → Cloudflare Worker) at `play.martelounge.ge`.

```
app/
  layout.tsx            brand header (auth state + sign-out) / footer; Noto Sans Georgian
  page.tsx              home: hero + popular venues (public_venues)
  venues/page.tsx       all venues
  [slug]/page.tsx       venue detail: profile, amenities, reviews (public_reviews), <BookingWidget/>
  account/page.tsx      customer's bookings (auth-gated): QR pass + review on completed
  auth/login|register   email/password (auth-form.tsx)
components/
  venue-card.tsx        listing card (rating, price_from)
  booking-widget.tsx    live availability grid (get_venue_availability) → pick slot → duration/plan/payment
                        → create_marketplace_booking (handles booking_conflict)
  booking-pass.tsx      QR pass (qrcode.react, encodes "MLB:<bookingId>") for pending/confirmed bookings
  booking-review.tsx    star rating + comment → submit_review (one per completed booking)
  sign-out-button.tsx
lib/supabase/{server,client}.ts   @supabase/ssr clients
lib/auth.ts             getUser()
wrangler.jsonc          name martelounge-web, nodejs_compat, ASSETS binding, route play.martelounge.ge (custom_domain)
open-next.config.ts     defineCloudflareConfig
```

**Customer journey:** browse → register (email/pw) → pick venue → see live console availability →
book (transfer / cash-on-arrival; **card via TBC/BOG deferred**) → get a **QR pass** in /account →
show it at the venue → staff **scan + check-in** (admin online-bookings) → after the session, **review** ⭐.

> Supabase **"Confirm email" should be OFF** (dashboard) for smooth signup, else signUp returns no session
> until the user confirms (the register form handles both). Phone OTP via Twilio is a later upgrade.

---

## 6. Design system (MATCH THIS — shared by both apps)

Dark neumorphic. Use these utilities (in each app's `globals.css`), not raw shadows:

| Class | Use |
|---|---|
| `nm-raised` / `nm-raised-sm` | extruded surface — cards, panels |
| `nm-inset` | pressed/inset — inputs, wells, icon chips |
| `nm-btn` | interactive button — lifts hover, presses active |
| `nm-daylight` (admin) / `nm-glow` (web) | glowing selected/active state, primary CTA |
| `nm-neon-blue/orange/red` (admin) | console-card neon pulse by status |
| `text-glow` | primary-color text glow |

- Palette: dark `oklch` background, teal/cyan **primary** (`--primary`), status colors free/active/warning/expired.
- Money: `gel(n)` (admin `lib/ui.ts`, web `lib/utils.ts`). Radii `rounded-2xl/3xl`. Icons lucide `size-4/5`.
- **All UI text is Georgian (ka).** Match the existing tone.
- **Mobile:** admin sidebar is a hamburger drawer.

---

## 7. Migrations (apply in order — `rvlkimzqzwizcivkxtnd`)

```
0001–0008  initial schema, pgcrypto/FK indexes, MULTI-TENANT foundation (orgs/venues/members/
           platform_admins + org_id everywhere + RLS), per-venue slot unique, payment_method+bank,
           BAR POS (bar_categories/products/sales/sale_items + create_bar_sale), inventory+customers,
           platform_org_overview view
0009–0016  fiscal settings + next_fiscal_receipt_no, audit_logs + log_audit triggers, void/refund,
           perf indexes, expenses + get_venue_pnl + monthly_pnl, reservations RPCs, tips, soft-delete
0017  suspension enforcement (is_org_member_raw; is_org_member/admin deny canceled orgs)
0018  fix create_bar_sale — org_id on bar_sale_items
0019  OPEN (pay-as-you-go) sessions: is_open + nullable ends_at/duration_min; start_open_session;
      end_session rounds up 5 min (min 5); Pro tier seeded; create_organization seeds std/pro/premium
─ v3 phase ───────────────────────────────────────────────────────────────────────────────────────
0020  preflight + open-session safeguard: pg_cron + `private` schema + `accountant` role +
      is_org_accountant() + open-session KILL SWITCH (cron */15, 24h cap) + end_session caps at 1440
0021  rate limiting: `ratelimit` schema + ratelimit.check() + cleanup cron; guards on
      start_session/start_open_session/create_bar_sale/void_bar_sale/clock_toggle
0022  PIN gate: identify_by_pin(pin) + widened employees.role to all 6 roles
0023  salaries: employees.salary_type/salary_amount + process_payroll(org,venue,from,to) → 'salary' expenses
0024  onboarding: create_employee(org,name,role,pin) (admin-only, hashes PIN, blocks dup) +
      organizations.identification_code + create_organization 3rd id-code arg
0025  VAT: venues.is_vat_registered + expenses.vat_amount + get_vat_summary() (18% inclusive, reporting layer)
0026  cash reconciliation: cash_reconciliations + reconcile_shift() (>₾5 alert)
0027  budgets: venue_budgets + budget_vs_actual view
0028  invoices: invoices + invoice_items + next_invoice_number() (read=accountant, write=admin)
0029  accounting v2 UI alignment (invoice/budget field names, add_expense p_vat_amount, budget org_id trigger)
─ marketplace ──────────────────────────────────────────────────────────────────────────────────────
0030  marketplace foundation: venues public cols (slug, is_published, description, address, city,
      public_phone, cover_image_url, gallery, amenities, opening_hours, lat/lng, avg_rating, review_count)
      + slugify() (unicode/Georgian) + marketplace_customers (PK=auth.users) + public_venues VIEW (anon)
0031  marketplace_bookings + get_venue_availability(slug,date) + create_marketplace_booking(...)
      (advisory-lock conflict-safe, 5% commission) + staff/customer RLS
0032  marketplace_reviews + recompute_venue_rating trigger + submit_review + reply_to_review + public_reviews VIEW
0033  hardening: pin slugify search_path + revoke PUBLIC execute on the SECURITY DEFINER RPCs
0034  public_venue_plans VIEW (anon active tiers per published venue — booking pricing)
0035  fix review one-per-booking: full unique index on marketplace_reviews.booking_id (ON CONFLICT)
0036  add marketplace_bookings to supabase_realtime publication (live admin bell)
```

> **Schema-compat invariants:** no enum types (all `text + CHECK`); `consoles.id` & `pricing_plans.id`
> are **integer** (not uuid) → marketplace FKs to them are integer; `sessions.id`/`customers.id` ARE uuid.

---

## 8. Data model

### Core / Gaming / Bar (unchanged foundation)
| Table | Key columns |
|---|---|
| `organizations` | id, name, plan, subscription_status, trial_ends_at, **identification_code** |
| `venues` | id, org_id, name, is_active, fiscal_* , **is_vat_registered**, + **public profile cols** (slug, is_published, description, address, city, public_phone, cover_image_url, gallery, amenities, opening_hours, lat, lng, avg_rating, review_count) |
| `org_members` | org_id, user_id, role (6 roles) · `platform_admins` user_id |
| `consoles` | id(int), org_id, venue_id, slot_number, name, status, deleted_at |
| `sessions` | id(uuid), org_id, venue_id, console_id(int), pricing_plan_id(int), payment_method, bank, price_total, is_open, ends_at?, duration_min?, tip_amount, status |
| `pricing_plans` | id(int), org_id, name, type(standard/pro/premium/custom), price_per_hour, controllers |
| `employees` | id, org_id, name, role, pin_hash, **salary_type, salary_amount** |
| `shifts` | id, org_id, venue_id, employee_id, clock_in, clock_out, hours_worked |
| `bar_categories` / `bar_products` / `bar_sales` / `bar_sale_items` | POS; products have R2 image_url, stock, cost_price, barcode |
| `customers` | id, org_id, name, phone, points, visit_count, total_spent, discount_pct, deleted_at |
| `reservations` | id, org_id, venue_id, console_id, customer_name, customer_phone, start_time, duration_min, status, session_id |
| `audit_logs` | id, org_id, venue_id, actor_id/email, action, entity_type, entity_id, payload(jsonb) |

### Accounting v2
| Table | Key columns |
|---|---|
| `expenses` | id, org_id, venue_id, category, amount, **vat_amount**, description, expense_date |
| `cash_reconciliations` | shift cash count vs expected (`reconcile_shift`, >₾5 alert) |
| `venue_budgets` | org_id, venue_id, month, revenue_target, expense_budget (+ `budget_vs_actual` view) |
| `invoices` / `invoice_items` | invoice no (`next_invoice_number`), vat_total, total_amount, issued_at, status; read=accountant/write=admin |

### Marketplace
| Table / View | Key columns |
|---|---|
| `marketplace_customers` | id (PK = `auth.users.id`), full_name, phone, email |
| `marketplace_bookings` | id(uuid), org_id, venue_id, console_id(int?), pricing_plan_id(int?), customer_id, customer_name, customer_phone, start_time, duration_min, controllers, **status** (pending/confirmed/cancelled/completed/no_show), **payment_method** (transfer/card/cash_on_arrival), **payment_status** (unpaid/deposit_paid/paid/refunded), total_amount, deposit_amount, commission_amount (5%), paid_at, payment_ref, reservation_id, notes |
| `marketplace_reviews` | id, org_id, venue_id, booking_id (unique), customer_id, rating(1-5), comment, reply |
| `public_venues` (anon view) | published+active venues, public cols + price_from (min active plan) |
| `public_reviews` (anon view) | rating, comment, reply, author (customer full_name) |
| `public_venue_plans` (anon view) | venue_slug, plan_id, name, price_per_hour, controllers, type |

> Anon clients read **only the curated public views** (never raw `venues`/etc.) — these are
> SECURITY DEFINER views exposing safe columns; tighter than granting anon base-table access.

---

## 9. RPCs & functions

**Sessions/POS:** `start_session`, `start_open_session`, `extend_session`, `end_session(p_tip?)`,
`create_bar_sale(…,p_tip?)`, `void_bar_sale`, `refund_session`, `clock_toggle(pin,venue)`.

**Org/RBAC:** `create_organization(name,…,id_code?)`, `create_employee(org,name,role,pin)`,
`identify_by_pin(pin)`, `is_org_member/_raw/admin/accountant`, `is_platform_admin`.

**Accounting:** `add_expense(…,p_vat_amount?)`, `delete_expense`, `get_venue_pnl(venue,from,to)`,
`get_vat_summary(...)`, `reconcile_shift(...)`, `process_payroll(org,venue,from,to)`,
`next_invoice_number()`, `next_fiscal_receipt_no()`.

**Marketplace** (SECURITY DEFINER, search_path pinned, PUBLIC execute revoked in 0033):
- `get_venue_availability(p_slug,p_date)` → per-console busy intervals — **anon+authenticated**
- `create_marketplace_booking(p_slug,p_start,p_duration_min,p_customer_name,p_customer_phone,
  p_console_id?,p_pricing_plan_id?,p_controllers?,p_party_size?,p_payment_method?,p_notes?)` → uuid —
  **authenticated**; advisory-locked, raises `booking_conflict`/`venue_not_found`/`start_in_past`/…
- `submit_review(p_booking_id,p_rating,p_comment?)` — authenticated, completed bookings only (upsert)
- `reply_to_review(p_id,p_reply)` — staff (`is_org_member`)
- `slugify(text)`, `recompute_venue_rating()` (trigger)

**Views (security_invoker / curated):** `session_revenue`, `console_stats`, `daily/period_revenue`,
`monthly_pnl`, `budget_vs_actual`, `platform_org_overview`, `public_venues`, `public_reviews`, `public_venue_plans`.

---

## 10. Realtime & notifications (live online-booking bell)

- Migration 0036 adds `marketplace_bookings` to the `supabase_realtime` publication (RLS still applies →
  staff only get their org's rows).
- `BookingAlertsProvider` (admin-shell, inside PlayroomProvider): Supabase **Realtime** subscription
  (org-filtered) for INSERT/UPDATE + a 60s poll & window-focus refetch fallback. Exposes `pendingCount`.
- New booking → topbar **bell** glows + pulsing badge with the pending count (on ANY module) + toast
  "🔔 ახალი ონლაინ ჯავშანი — <name>" + Web-Audio chime (gated by `settings.sound_alerts`).
- Bell click → opens the `online_bookings` module (`onBellClick`).

### QR check-in
- Customer `/account` shows a **QR pass** (`qrcode.react`, content `MLB:<bookingId>`) for pending/confirmed bookings.
- Admin online-bookings "📷 სკანირება" opens `barcode-scanner.tsx` (camera) → parses `MLB:<id>` →
  RLS-scoped lookup → verify modal (customer/time/console/payment) → **check-in** (confirm) or "ვერ მოიძებნა".
- Safe: `booking_id` is an unguessable uuid, the QR only appears in the owner's RLS-protected account,
  and lookup requires org-staff RLS.

---

## 11. AI assistant

```
Client (ai-assistant.tsx) → supabase.functions.invoke('ai-assistant',{messages})
  → Edge fn runs Gemini with the CALLER's JWT → RLS/roles/suspension all apply
  → Read tools run server-side; WRITE tools return {type:'confirm'} → UI approval → run → summary
```
- Built from the caller's JWT — the AI never exceeds the user's rights. **No service_role.**
- Read tools (overview/consoles/plans/products/customers/sales/sessions/employees/reservations/expenses/revenue)
  + confirm-gated write tools (start_session, start_open_session, end_session, create_bar_sale, restock_product).
- Models: `gemini-2.5-flash → 2.0-flash → 2.5-flash-lite`; **thinking disabled** (`thinkingBudget:0`); retry on 429/503.
- `GEMINI_API_KEY` lives ONLY as a Supabase secret, from a **fresh** GCP project. Never client-side/in git.
- Deploy: `memory/edge-function-deploy.md` (CLI with User `SUPABASE_ACCESS_TOKEN`, `--use-api`).

---

## 12. RS.GE Fiscal, Billing & Plans

**Fiscal** (per-venue `fiscal_enabled`, + `is_vat_registered` for VAT): Phase B = `issueReceipt()` →
`window.print()` 80mm; receipt no `next_fiscal_receipt_no()` → `GE-YYYYMMDD-XXXXXX`. Phase C (hardware
bridge → Daisy/EFTS → RS.GE) is future.

**Plans:** trial (₾0, 1 venue/4 consoles/3 employees/14d) · pro (₾99/mo) · enterprise (₾299/mo, RS.GE fiscal+API).
Upgrade = manual/invoice; platform admin changes plan in God Mode. **Auto-billing (TBC Pay/BOG) is future.**

---

## 13. Deploy & ops

- **Admin:** push `main` → GitHub `jabsona-digit/PLAYROOM_PS5` → Cloudflare Pages `playroom-ps5` auto-builds
  (`npm run build` → `out`) → `martelounge.ge` (+ www). Nameservers on Cloudflare (deborah/lennon.ns.cloudflare.com).
- **Marketplace:** from `martelounge-web/`: `npx wrangler login` once, then **`npm run deploy`**
  (`opennextjs-cloudflare build && deploy`) → Worker at `play.martelounge.ge` (custom_domain auto-provisions DNS+SSL).
  Windows gotcha: if `.open-next` is EPERM-locked, stop workerd/wrangler + `Remove-Item -Recurse -Force .open-next` first.
- **Migrations:** applied to live via Supabase MCP `apply_migration` (or `db push`), then committed under
  `supabase/migrations/`; the `gen-types.yml` GitHub Action regenerates `lib/database.types.ts` on push.
  (Re-sync the marketplace repo's `lib/database.types.ts` copy after migrations.)
- **Secrets:** `SUPABASE_ACCESS_TOKEN` = a User-level Windows env var (expires **2026-07-06** — renew;
  also a GitHub secret for CI). `GEMINI_API_KEY`, `TWILIO_*`, future `TBC_PAY_API_KEY`/`BOG_PAY_API_KEY`
  live ONLY as Supabase secrets. Publishable (anon) key only on the client.

---

## 14. Working agreement

| Who | Owns |
|---|---|
| **Claude** | migrations, DB schema, RLS, RPCs, edge functions, `database.types.ts`, `store.tsx`, `org.tsx`, `fiscal.ts`, marketplace backend, security-sensitive code |
| **Gemini / Sonnet** | UI components, layout, styling, client interactions, non-security frontend |

- Never change DB/RLS/migrations from the frontend — request it from Claude.
- Keep `payment_method`/`bank` (and marketplace status/payment) enums identical across modules.
- Admin: keep `npm run build` **and `npx tsc --noEmit`** green (build ignores TS errors). Web: `next build --webpack` green.
- Regenerate `lib/database.types.ts` after every migration (both repos).
- Never expose `service_role` client-side. Images → R2 (`uploadImage`), never Supabase Storage.
- Keep open-session rounding in sync between `end_session` and `openBillableMinutes()`.

---

## 15. Roadmap (remaining)

- 💳 **Online payments** — TBC Pay / BOG Pay card flow + webhooks (set `payment_status='paid'`, `payment_ref`);
  also venue auto-billing. Deferred until API keys. (Schema already has the columns.)
- 🧾 **RS.GE Fiscal Phase C** — local hardware bridge.
- 🏆 **Tournaments** — brackets/participants/matches + TV display mode (`app/tv/[venue_id]`).
- 🧑‍💼 **External accountant invites (0037)** — needs an RLS redesign so `accountant` is truly READ-ONLY
  (today `org_scope` "for all" policies grant any member write; split SELECT vs write on finance tables).
- 📱 **PWA install + camera barcode** in POS/inventory; phone OTP (Twilio) for marketplace signup.
- 🌐 Optional: move marketplace to the apex (`martelounge.ge`) and admin → `app.martelounge.ge`.

> Living roadmap & decisions: `memory/roadmap-v3-marketplace.md`, `memory/marketplace-backend.md`,
> `memory/marketplace-frontend.md`, `memory/media-r2-uploads.md`, `memory/admin-module-registration.md`.
