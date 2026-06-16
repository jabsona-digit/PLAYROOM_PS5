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

> _Last updated **2026-06-16** — through migration **0075**. Since the previous (0036) revision:
> tournaments, capacity/typed-resource booking, God-Mode tenant billing, **plan entitlements (0062)**, payroll/RBAC hardening,
> team email-invites, operator shifts & attribution, shared cash drawer, abandoned sessions, bar COGS,
> **In-Seat Ordering portal** (live-session + per-session PIN/QR access gate, 0060–0061),
> **AI receipt OCR + anti-fraud audit** (+ Georgian↔Latin fuzzy product resolution), **per-tenant online payments (Phase 1)**,
> **RevPACH analytics + AI advisor (0059)**, **hardware console control** (vendor-agnostic power/TV gating, 0063–0066),
> **dynamic pricing — Happy Hour/Surge (0067)**, **predictive hardware maintenance (0068)**, **public real-time "Pulse" page (0069)**,
> **AI Closing Brief (0070)**, **multi-venue-type / Entertainment Venue OS — billiard (0071) + lamp control with grace (0072)**,
> **mobile-responsive admin**, and **bot-safe SEO + ISR caching** on both sites._

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

> **3-domain split (LIVE 2026-06-15):** the apex now serves a **marketing site**; the admin moved to **app.martelounge.ge**. Old `martelounge.ge/app` & `/p` links 302-redirect to the app subdomain (marketing site `public/_redirects`). See `memory/marketing-site-and-domains.md`.

| | Marketing site | Admin app (this repo) | Marketplace |
|---|---|---|---|
| Repo | `martelounge-site` (GitHub `jabsona-digit/martelounge-site`; local `Desktop/martelounge-website-redesign`) | `playroom-admin-panel` (GitHub `PLAYROOM_PS5`) | `martelounge-web` (GitHub `PLAYROOM_PS5-REPO`) |
| Domain | **`martelounge.ge`** (+ www) | **`app.martelounge.ge`** | `play.martelounge.ge` |
| Rendering | Next 14 **static export** (refined v0 redesign) | `output:'export'` static SPA | **SSR** via `@opennextjs/cloudflare` |
| Host | Cloudflare **Pages** (`martelounge-site`) | Cloudflare **Pages** (`playroom-ps5`) | Cloudflare **Worker** |
| Deploy | push `main` → Pages auto-build (`npm run build` → `out`; needs `.npmrc` legacy-peer-deps, no pnpm-lock) | push `main` → Pages auto-build (`out`) | `npm run deploy` (wrangler) |
| SEO | public (robots/sitemap/GSC) | **noindex** (private app) | public views |
| Audience | venue owners (marketing) | venue owners & staff (the product) | end customers (players) |

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
app/p/page.tsx          PUBLIC In-Seat Ordering portal — /p?v=<venue>&c=<console>, anon, NO auth gate
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
  receipt-scanner.tsx   AI receipt OCR (Gemini Vision) → auto-fills an expense (used in accounting)
  fraud-audit.tsx       "🕵️ AI აუდიტი" tab in history — audit-log forensics + per-operator Trust Score
  service-inbox.tsx     floating realtime In-Seat inbox (order/battery/call) → fulfil → bar_sale
  qr-print-modal.tsx    print per-console QR codes for the In-Seat portal (qrcode.react)
  inseat-access-modal.tsx  operator's per-session In-Seat PIN + QR (&k=) for a live console
  hardware-settings.tsx  Settings → 🔌 Hardware: per-console mode/driver/target + Force ON/OFF + Shelly Cloud creds + "require hw" toggle
  payment-settings.tsx  Settings: connect own TBC/BOG merchant (Vault-encrypted; BYO-merchant)
  team-settings.tsx     Settings: email-invite staff (each gets own login + role)
  tournaments.tsx       single-elim PS5 brackets + TV mode
  guide.tsx             in-app handbook (searchable; covers AI, In-Seat, payments, …)
  analytics-v2.tsx      RevPACH module — KPIs, per-console matrix, 7×24 heatmap, AI advisor button
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
supabase/functions/hardware-control/index.ts  cloud power dispatch (Shelly Cloud; service-role reads the Vault secret)
supabase/migrations/    0001–0066 (see §7)
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
| Settings (+ fiscal/VAT + marketplace publish + **team invites** + **online-payment credentials**) | `settings` | owner/admin | ✅ |
| Reservations (internal) | `reservations` | owner/admin/manager/cashier | ✅ |
| **Online bookings (marketplace inbox + QR check-in)** | `online_bookings` | owner/admin/manager/cashier | ✅ |
| Platform God Mode | `platform` | platform_admins | ✅ |
| Billing | `billing` | owner | ✅ |
| Tournaments (single-elim brackets + TV mode) | `tournaments` | owner/admin/manager | ✅ |
| Guide (in-app searchable handbook) | `guide` | all | ✅ |
| AI assistant (Gemini, voice, actions) | `ai-assistant` | all | ✅ |
| Analytics — RevPACH (matrix + 7×24 heatmap + AI advisor) | `analytics` | owner/admin/manager | ✅ |

> **Not modules (always-on overlays):** the **In-Seat operator inbox** (`service-inbox.tsx`, floating, realtime)
> and the **AI assistant** float over every module; the public **In-Seat portal** lives at `/p` (its own page,
> no auth). Receipt OCR + AI fraud audit live inside accounting / history.

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

**SEO & bot-safety (both sites, 2026-06-14):** `app/robots.ts` + `app/sitemap.ts` on each (admin = `force-static`
for `output:export`); both GSC-verified + sitemaps submitted; robots **Disallow `/*?`** (kills `?q=` crawl-
amplification — the Kale lesson) + AI-scraper block; OG/canonical per page. On the marketplace, public pages are
**ISR-cached** to shield Supabase from crawls: auth moved client-side (`components/header-auth.tsx` +
`booking-widget` self-reads the session) and all public reads go through a **cookie-less** `lib/supabase/public.ts`
client, so `/` (ISR 30m) and `/[slug]` (SSG+ISR 1h via `generateStaticParams`) serve from CDN, not Supabase.
`/venues` (search) + `/account` (per-user) stay dynamic. User-side: Cloudflare **Bot Fight Mode** is On.
See `memory/seo-and-bot-safety.md`.

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
─ v4: tournaments, capacity, platform billing, hardening ─────────────────────────────────────────────
0037  tournaments/participants/matches + seed_tournament (power-of-2 + byes) + report_match (auto-advance)
0038  capacity booking: get_venue_availability counts bookings+reservations+LIVE sessions; create_marketplace_booking peak-concurrency check
0039  typed resources: consoles.console_type (PS5/კუპე/VIP) + enforce_console_capacity trigger (walk-in guard)
0040  platform billing: organizations.current_period_end + platform_payments + plan_monthly_price + mark_tenant_paid; plan prices Trial 0 / Pro 45 / Enterprise 65
0041  fix get_venue_pnl (sum over CTE col)    0042  track monthly_pnl    0043  bootstrap_founder
0044/0045  lock function grants least-privilege (anon = marketplace + portal RPCs only; helpers locked)
0046  pnl tips + public_reviews              0047  ai_rate_limit (ai_usage + guard on ai-assistant)
0048  harden employees chain (writes admin-only)   0049  hide pin_hash (column SELECT revoked)
0050  payroll idempotent (payroll_runs)      0051  team invites (org_invites + create/accept/revoke_invite)
0052  shift-on-login (start_shift/end_shift) 0053  operator attribution (sessions/bar_sales created_by_user)
0054  shared cash drawer                     0055  abandoned sessions (flag auto-closed; excluded from revenue)
0056  bar COGS in P&L + inventory valuation
─ in-seat ordering + payments ────────────────────────────────────────────────────────────────────────
0057  IN-SEAT ORDERING: service_requests + RLS + realtime; anon SECURITY DEFINER RPCs (portal_get_menu /
      portal_get_session_status / portal_place_order / portal_request_service) + resolve_service_request (operator → bar_sale)
0058  PER-TENANT PAYMENTS (Phase 1): org_payment_credentials (RLS-locked) + Supabase Vault secrets +
      save/get/set_active/delete_payment_credentials (BYO TBC/BOG merchant; secrets never reach the client)
0059  RevPACH ANALYTICS: get_console_analytics(venue,from,to,daily_hours) — per-console occupancy/RevPACH,
      venue totals + 7×24 demand heatmap (Asia/Tbilisi); is_org_member-gated. Feeds the AI advisor (Path D).
0060  IN-SEAT gate: portal_place_order / portal_request_service now REQUIRE a live session (else no_active_session)
0061  IN-SEAT per-session code: sessions.portal_code (6-digit; BEFORE-INSERT trigger) + portal_unlock (rate-limited);
      both write RPCs take p_code (typed PIN or QR &k=) — kills the static-QR replay edge (bad_code if mismatch)
0062  PLAN ENTITLEMENTS: org_plan/plan_rank/require_plan/plan_limit + BEFORE triggers — PRO gates bar_sales/
      bar_products/bar_categories/customers/expenses; ENTERPRISE gates venues.fiscal_enabled; limits venues
      (1/3/∞), consoles/venue (4/8/∞), PIN employees (3/∞). Platform admins bypass; existing rows grandfathered.
─ hardware console control (vendor-agnostic; tie power/TV to session — anti-fraud) ────────────────────
0063  HARDWARE foundation: console_hardware (control_mode manual/cloud/agent, driver, target tv/console/hdmi,
      jsonb config) + power_events audit + log_power_event + get_ghost_power_events. Device-agnostic, SSD-safe.
0064  set_console_power (sets desired_state; manual logs immediately; Force=admin) + ghost query → state_poll only
0065  HARDWARE cloud creds: hardware_credentials (Vault auth_key) + save/get_settings/delete + get_hardware_secret
      (service_role ONLY) → edge `hardware-control` Shelly Cloud driver (cloud→cloud, no on-site agent)
0066  venues.hardware_required + enforce_hardware_required trigger (OPT-IN: block session if console has no hw)
─ revenue · ops · community (roadmap-v2) ───────────────────────────────────────────────────────────────
0067  DYNAMIC PRICING: dynamic_pricing_rules (day/time/occupancy → multiplier, priority) + dynamic_price_quote
      + BEFORE-INSERT trigger on sessions (server-authoritative Happy Hour / Surge). Default off = no change.
0068  HARDWARE MAINTENANCE: consoles wear cols + GENERATED hardware_health_score + bump_console_usage trigger
      (accrues played hours on completion, capped 24h) + mark_controller_serviced (admin reset). Backfilled.
0069  PULSE: get_pulse_stats() — anon aggregated public census (players now, per-city/venue occupancy, month
      sessions/hours) over published non-suspended venues → marketplace /live page.
0070  AI CLOSING BRIEF: get_daily_brief_data(venue,date) — one daily snapshot (revenue vs yesterday, top/idle
      consoles, peak hour, fraud counts, low stock, hardware health) → ai-assistant Path E run_daily_brief.
─ multi-venue-type · "Entertainment Venue OS" (billiard first) ──────────────────────────────────────────
0071  MULTI-VENUE-TYPE: venues.venue_type (playroom|billiard|karaoke|vr|mixed, CHECK, default playroom) +
      venues.venue_config jsonb + consoles.asset_label (custom name). console_hardware.target += 'light'.
      public_venues + get_pulse_stats expose venue_type (marketplace /live category tabs). NOTE: console_type
      stays FREE-TEXT (typed capacity pools, 0039) — billiard tables = console_type 'ბილიარდი'/'სნუკერი', no rename.
0072  HARDWARE GRACE: console_hardware.off_delay_seconds (0–600). Billiard lamp (target='light') auto-on at
      session start, OFF after a grace delay on session_end (customer pays/racks up). 0 = instant (PS5/TV default).
0073  PORTAL BILLIARD: portal_get_session_status/portal_unlock now return console_type; portal_request_service
      accepts 'equipment' (service_requests.kind widened). /p shows "ინვენტარი" for billiard instead of battery.
0074  TARIFF CATEGORY: pricing_plans.category (playroom|billiard|karaoke|vr, null=all) + on public_venue_plans.
      Start-session modal + marketplace booking list only tariffs matching the asset's category. Tariffs editor
      gets a "ვისთვის" picker. Backward compatible (untagged tariffs show everywhere).
0075  PULSE CATEGORIES: get_pulse_stats returns each venue's REAL categories[] (from console_type pools). /live
      shows a mixed venue only under the tabs it truly offers, not every one. venue_type stays as the card badge.
```

> **Multi-venue-type frontend (no migration):** dynamic labels via `lib/ui.ts` ASSET_LABELS (🎮 კონსოლი / 🎱
> მაგიდა, RevPACH→RevPATH) on dashboard + analytics; venue_type selector in Marketplace profile; billiard/snooker
> in the console-type cycler; cashier splits session revenue by category; marketplace booking hides controllers
> for billiard + filters tariffs by category (0074); /live groups by real per-venue categories (0075).

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
| `sessions` | id(uuid), org_id, venue_id, console_id(int), pricing_plan_id(int), payment_method, bank, price_total, is_open, ends_at?, duration_min?, tip_amount, status, **portal_code** (6-digit In-Seat PIN/QR, BEFORE-INSERT trigger) |
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

### In-Seat, Payments, Platform, Tournaments
| Table | Key columns |
|---|---|
| `service_requests` | id, org_id, venue_id, console_id(int), session_id?, **kind** (order/battery/call), items(jsonb snapshot), total, **status** (pending/done/dismissed), resolved_by, sale_id → bar_sales. RLS org-scoped; anon revoked (portal RPCs only); in realtime publication |
| `org_payment_credentials` | id, org_id, **provider** (tbc/bog), merchant_id, **secret_ref** → `vault.secrets` (encrypted), is_active, status, last_tested_at; unique(org_id,provider). RLS ON, ZERO authenticated grants — RPC-only |
| `platform_payments` | tenant subscription payments log (platform-only RLS); `organizations.current_period_end` = paid-until |
| `tournaments` / `tournament_participants` / `tournament_matches` | single-elim bracket (seed_tournament + report_match auto-advance + champion) |
| `console_hardware` | id, org_id, venue_id, console_id, **control_mode** (manual/cloud/agent), driver, **target** (tv/console/hdmi/network — default `tv`, SSD-safe), config(jsonb), secret_ref, desired_state, last_known_state. RLS member-read / admin-write |
| `power_events` | console on/off audit (uuid session_id; **triggered_by**; success/error). Ghost partial index → anti-fraud read |
| `hardware_credentials` | per-venue cloud account (**provider** shelly/tuya, server, **secret_ref** → Vault auth_key). RLS admin; key readable only by `service_role` |
| `venues.hardware_required` | bool (default false) — opt-in gate: block starting a session on a console with no active hardware |
| `dynamic_pricing_rules` | org/venue, name, rule_type (happy_hour/surge), days_of_week[], time_from/to, occupancy band, **multiplier**, priority. A sessions BEFORE-INSERT trigger applies the rate; `dynamic_price_quote` serves UI + trigger |
| `consoles.*` (maintenance) | **total_sessions_count**, total_hours_played, **hours_since_service** (resets on service) + GENERATED **hardware_health_score** (95/75/50/20). `bump_console_usage` accrues on session completion |

> Secrets policy: payment credentials use **Supabase Vault** (`vault.create_secret`/`decrypted_secrets`),
> decryptable server-side only. PIN hashes (`employees.pin_hash`) have column SELECT revoked (0049).

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

**In-Seat portal** (SECURITY DEFINER; portal_* RPCs granted to **anon**): `portal_get_menu(venue)`,
`portal_get_session_status(console)`, `portal_unlock(venue,console,code)` (verifies the per-session code;
rate-limited via `ratelimit.check`), `portal_place_order(venue,console,items,code)` (server-priced, anti-spam,
suspension-aware), `portal_request_service(venue,console,kind,code)`. Every write requires a **live session**
+ matching `portal_code` (else `no_active_session` / `bad_code`). + `resolve_service_request(id,status,method?,bank?)`
(operator-only → rings up `create_bar_sale`).

**Hardware control** (vendor-agnostic): `set_console_power(console,action,session?,trigger)` — member-gated, Force=admin; sets `desired_state` and for manual/no-device logs the event immediately. `log_power_event(...)` + `get_ghost_power_events(venue,from,to)` (anti-fraud). `save_hardware_credentials` / `get_hardware_settings` / `delete_hardware_credentials` (admin; Vault-backed) + **`get_hardware_secret`** (granted to **`service_role` only** — the Shelly auth_key, for the edge fn). `enforce_hardware_required` trigger blocks session start when `venues.hardware_required` and the console has no active hardware. Cloud devices dispatch via the `hardware-control` edge fn (Shelly Cloud); LAN relays via a local agent (planned, Phase 2).

**Payments / platform / tournaments:** `save_payment_credentials` / `get_payment_settings` /
`set_payment_provider_active` / `delete_payment_credentials` (per-tenant BYO merchant, Vault-backed,
is_org_admin-gated); `mark_tenant_paid(org,months,…)` (God-Mode billing); `seed_tournament` / `report_match`.

**Dynamic pricing / Pulse / maintenance:** `dynamic_price_quote(venue, base, when)` → effective rate + which rule applied (UI badge + the sessions trigger use it); `get_pulse_stats()` — **anon**, aggregated public census for `/live` (players now, per-city/venue occupancy, month sessions/hours; published non-suspended venues only, no PII); `mark_controller_serviced(console)` (admin) resets the wear clock.

**Analytics:** `get_console_analytics(venue, from, to, daily_hours)` — per-console occupancy + RevPACH +
7×24 demand heatmap (is_org_member-gated; pure SQL over `sessions`). Consumed by `analytics-v2.tsx` and the AI advisor.

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

### In-Seat Ordering (live, migrations 0057–0061)
- Customer scans a per-console QR (printed from Settings via `qr-print-modal.tsx`) → opens the PUBLIC
  portal `app/p` (`/p?v=<venue>&c=<console>`, anon, no auth gate) → live bar menu + session countdown +
  order / call-staff / report-dead-joystick.
- **Money-safe:** the portal NEVER writes financial rows. Orders land as PENDING `service_requests` via
  anon SECURITY DEFINER RPCs (server-priced, ≤5 pending/console, suspension-aware). `service_requests` is in
  the realtime publication; `service-inbox.tsx` (floating, bottom-left) gives the operator a live inbox
  (beep + badge). Fulfilling an order → `resolve_service_request` rings up the real `create_bar_sale`.
- **Per-session access gate (0060–0061):** the printed QR is static, so every write requires a *live* session
  AND the session's rotating 6-digit `sessions.portal_code` (set by a BEFORE-INSERT trigger). A customer types
  the PIN the operator gives, or scans a session QR carrying `&k=<code>`; `/p` auto-unlocks from `&k=` or a
  sessionStorage-kept code and **re-locks** when the session ends or the code rotates. `portal_unlock` is
  rate-limited. The operator reads the PIN off the live console card or shows the QR (`inseat-access-modal.tsx`).

### Hardware console control (vendor-agnostic, migrations 0063–0066)
- **Goal:** tie physical power/TV-signal to session status so staff can't run a console without an open
  session (lost revenue, invisible to anti-fraud/RevPACH). **SSD-safe:** `target` defaults to `tv` (cut the
  display, never hard-kill the PS5).
- **Device-agnostic:** a console maps to ONE `console_hardware` row with `control_mode` (manual | cloud |
  agent) + a free-form `driver` + jsonb `config` — new devices need a driver in code, not a migration.
  `manual` mode works with no device (Force ON/OFF + audit). Settings → 🔌 Hardware (`hardware-settings.tsx`).
- **Dispatch:** session start/end fire `set_console_power` (fire-and-forget, never blocks the session); it sets
  `desired_state`. **Cloud** devices (Shelly Cloud) → the `hardware-control` edge fn (caller JWT authorises via
  RLS; **service-role** reads the Vault auth_key via `get_hardware_secret`; POSTs the vendor cloud) → logs
  `power_events`. **Agent** (LAN relays — USR/Waveshare/Shelly-LAN, the Georgian "სოჩიკი") = planned Phase 2:
  a local bridge subscribes to `desired_state` and drives the relay locally (cloud can't reach 192.168.x.x).
- **Opt-in enforcement:** `venues.hardware_required` (default off). When on, a BEFORE-INSERT trigger on
  `sessions` blocks starting a session on a console with no active hardware (`hardware_required`). Anti-fraud
  read `get_ghost_power_events` flags a console powered on with no session (agent state-poll, Phase 3).

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
- **Robust product refs:** `restock_product`/`create_bar_sale` accept a `product_name` resolved server-side
  (Georgian↔Latin transliteration + fuzzy match, e.g. "ქემელი ბლუ"→"CAMEL BLUE"); ambiguous → ask, unknown →
  list. A one-time agent **nudge** forces a real functionCall when the model only *promises* an action in text.
- `GEMINI_API_KEY` lives ONLY as a Supabase secret, from a **fresh** GCP project. Never client-side/in git.
- Deploy: `memory/edge-function-deploy.md` (CLI with User `SUPABASE_ACCESS_TOKEN`, `--use-api`).

**Two more AI capabilities on the same edge fn (deployed, version 16+):**
- **Receipt OCR** — a message can carry an `image` (webp base64) → Gemini Vision. `receipt-scanner.tsx`
  snaps a receipt → returns `{amount,date,category,description}` JSON → auto-fills the expense form in accounting.
- **AI anti-fraud (Path C)** — `action:'run_fraud_audit'` (+`from`/`to`) reads `audit_logs`
  (cancel/refund/void/expense.delete) RLS-scoped to the caller's venue → Gemini forensic report +
  per-operator **Trust Score** (Georgian markdown). UI: `fraud-audit.tsx`, the "🕵️ AI აუდიტი" tab in history.
- **RevPACH advisor (Path D)** — `action:'run_revpach_advisor'` calls `get_console_analytics` under the
  caller's JWT → Gemini returns short, specific Georgian recommendations (fill dead zones, weak/idle
  consoles, a pricing insight). UI: "✨ AI რჩევები" in the `analytics` module.
- **AI Closing Brief (Path E)** — `action:'run_daily_brief'` (+optional `date`) calls `get_daily_brief_data`
  (one consolidated snapshot) → Gemini writes the owner's plain-Georgian end-of-day brief (grade + what went
  well + what to watch + 3 next actions). UI: "🌙 ღამის ანგარიში" button on the dashboard (`daily-brief.tsx`).

---

## 12. RS.GE Fiscal, Billing & Plans

**Fiscal** (per-venue `fiscal_enabled`, + `is_vat_registered` for VAT): Phase B = `issueReceipt()` →
`window.print()` 80mm; receipt no `next_fiscal_receipt_no()` → `GE-YYYYMMDD-XXXXXX`. Phase C (hardware
bridge → Daisy/EFTS → RS.GE) is future.

**Plans** (`plan_monthly_price()` is the DB source of truth): trial (₾0, 14d) · **pro (₾45/mo)** ·
**enterprise (₾65/mo**, RS.GE fiscal+API). God-Mode billing (migration 0040) is LIVE: `mark_tenant_paid`
records a `platform_payments` row + extends `current_period_end`; overdue badge + MRR in `platform.tsx`.
Subscription auto-billing (platform's own card flow) is future.

**Plan entitlements (migration 0062 — ENFORCED, was cosmetic before):** `plan` now actually gates features.
Helpers `org_plan(org)` / `plan_rank()` / `require_plan(org,min)` (raises `plan_upgrade_required:<min>`,
**platform admins bypass**) / `plan_limit(plan,kind)`. The real boundary is **BEFORE triggers** on the tables
(so every path — RPC or direct insert — is covered; `auth.uid()` still resolves the caller inside SECURITY
DEFINER): PRO+ → `bar_sales`/`bar_products`/`bar_categories`/`customers`/`expenses`; ENTERPRISE →
`venues.fiscal_enabled`; **limits** → venues 1/3/∞, consoles/venue 4/8/∞, PIN employees 3/∞
(`employees.user_id IS NULL` only, so invited members/shift-on-login never break). Existing rows are
grandfathered (triggers fire on new INSERT/UPDATE only). Frontend: `useOrg().plan` + `useModuleAccess`
(role AND plan) hides gated modules; a plan-blocked module shows `PlanUpgradeNotice`; Settings RS.GE fiscal
is locked to enterprise; `planErrorText` (lib/ui) gives friendly Georgian limit/upgrade messages. Module→plan
map = `FEATURE_MIN_PLAN` in `lib/org.tsx` (mirror billing.tsx). See `memory/plan-entitlements.md`.

**Customer payments (BYO-merchant, migration 0058 — Phase 1 LIVE):** each owner connects their OWN
TBC/BOG merchant account in Settings → „ონლაინ გადახდები" (`payment-settings.tsx`); secrets live in
**Supabase Vault**, never returned to the client, accessed only via is_org_admin-gated RPCs. Customers'
online-booking money lands in the OWNER's bank — the platform never custodies funds (no aggregator licence).
⏭️ Phase 2 (pending owner keys): live checkout + bank callbacks as edge functions → set
`marketplace_bookings.payment_status='paid'`. Bar + walk-in stay in-person (method recorded, not processed).

---

## 13. Deploy & ops

- **Marketing site:** push `main` → GitHub `jabsona-digit/martelounge-site` → Cloudflare Pages `martelounge-site`
  auto-builds (`npm run build` → `out`) → **`martelounge.ge`** (+ www). Refined v0 redesign; `.npmrc` legacy-peer-deps,
  no pnpm-lock (else CF picks pnpm + fails frozen-lockfile); `public/_redirects` sends `/app` & `/p` → app.martelounge.ge.
- **Admin:** push `main` → GitHub `jabsona-digit/PLAYROOM_PS5` → Cloudflare Pages `playroom-ps5` auto-builds
  (`npm run build` → `out`) → **`app.martelounge.ge`** (noindexed; was the apex before the 2026-06-15 cutover).
  Nameservers on Cloudflare (deborah/lennon.ns.cloudflare.com).
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

- 💳 **Online payments — Phase 2** — live checkout + bank callbacks as edge functions (reuse the Kale-group
  BOG/TBC logic, per-tenant Vault keys) → set `payment_status='paid'`/`payment_ref`. Phase 1 (credential
  storage) is DONE (0058); Phase 2 is blocked on the owner obtaining merchant keys.
- 📲 **SMS/Email (Twilio)** — booking confirm + reminder to cut no-shows. Blocked on a Twilio account.
- 🧠 **Proactive "AI Manager"** — nightly digest (RevPACH + fraud + inventory + COGS) → Telegram briefing with
  one-tap actions; the *intelligence* moat, works from venue #1. See `memory/killer-features-pending.md`.
- 🔌 **Hardware control — Phase 2/3** — local **agent** (separate repo) for LAN relays (USR/Waveshare/Shelly-LAN,
  the Georgian "სოჩიკი") + HDMI matrix + state-poll ghost detection. Foundation + Shelly Cloud done (0063–0066).
- 🧾 **RS.GE Fiscal Phase C** — local hardware bridge.
- 🧑‍💼 **External accountant read-only** — RLS redesign so `accountant` is truly read-only (split SELECT vs write).
- 🌐 ✅ DONE (2026-06-15): admin → `app.martelounge.ge`, apex `martelounge.ge` = new marketing site (separate repo).

> ✅ **Shipped since the 0036 revision:** tournaments (0037), capacity + typed-resource booking (0038/0039),
> God-Mode tenant billing (0040), accounting fixes + COGS (0041/0042/0056), grant hardening (0044/0045),
> AI rate-limit (0047), employees/PIN hardening (0048/0049), idempotent payroll (0050), team invites (0051),
> operator shifts + attribution (0052/0053), shared cash drawer (0054), abandoned sessions (0055),
> In-Seat Ordering (0057) + live-session/per-session PIN-QR access gate (0060/0061), per-tenant payments
> Phase 1 (0058), RevPACH analytics + AI advisor (0059), plan entitlements / tier enforcement (0062),
> hardware console control + Shelly Cloud (0063–0066), dynamic pricing (0067), predictive maintenance (0068),
> public real-time Pulse page (0069), AI receipt OCR + anti-fraud + fuzzy product resolution,
> mobile-responsive admin, bot-safe SEO + ISR caching (both sites, GSC verified), PWA + camera scan.

> Living roadmap & decisions: `memory/roadmap-v3-marketplace.md`, `memory/marketplace-backend.md`,
> `memory/marketplace-frontend.md`, `memory/media-r2-uploads.md`, `memory/admin-module-registration.md`.
