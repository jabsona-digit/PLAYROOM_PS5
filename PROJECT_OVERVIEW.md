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

> 📌 **For a future reviewer (e.g. Opus 4.8):** THIS file is the **current, live** state (through migration **0141**, 2026-06-27; onboarding-prep since is no-migration). The repo root holds two prior review handoffs — `SENIOR_REVIEW_HANDOFF.md` (v1, of the 0122 snapshot) and **`SENIOR_REVIEW_HANDOFF_v2.md`** (v2, re-review of 0126). **Their entire engineering tier is now CLOSED:** P0/P1 launch-critical (token rotation, a **required** `tsc` branch-protection check, observability) PLUS v2's "proof→regression-suite" upgrade — the **money + RLS invariants now run as a CI gate on every push** (`.github/workflows/db-invariants.yml`, see §13) and the AI threat model is written down (`SECURITY_AI_THREAT_MODEL.md`). The only deferred hardening item is a **paid staging branch** (v2 P1-1 — deferred to first-venue onboarding). Read THIS overview for current reality; the handoffs are historical, not an open to-do list.

> 🩺 **Current diagnosis & phase (2026-06-22):** the product is **feature-complete, launch-hardened, and self-testing** (money + tenant-isolation invariants gate every commit; Sentry + uptime live; AI is RLS-bound). **0 real venues use it yet** — only the founder tests; demand is waiting on a polished product. **DECISION (owner + senior): FREEZE net-new feature surface.** The bottleneck is no longer code — it is **real venues using it**. Next phase = **harden + onboard the first ~10 Tbilisi venues**, sold on the anti-fraud / **"see every lari, catch theft"** + RS.ge-compliance wedge (Trust Score, hardware-tied sessions, audit log, nightly Telegram brief) — NOT a feature list. New feature work is paused until venue density exists.

> _Last updated **2026-06-27** — through migration **0141** + onboarding-readiness prep (Excel import + runbook, no migration). **Since the 0076 revision (the big additions):**
> **Tournaments 2.0** — a full platform-promoted tournament product (groups+knockout / 3-1-0, host-bidding + tenant→Global
> promotion with commission, public marketplace listing, paid online registration → **QR pass → scan check-in (pay-at-venue)**
> → **„ვირტუალური დოლორა" server-fair group draw** → champion; min-participants gate + 1st/2nd/3rd prizes; the **FULL money
> loop** — automatic **prize payout** at champion-time (1st/2nd money→expenses, World-Cup **bronze match** decides 3rd,
> free play-time→`customer_credits`) + **in-venue credit REDEMPTION** at the cashier (scan code → discount the play charge)
> + **fair group tiebreaks** (head-to-head → penalties → lots), 0106–0121);
> **Telegram bot** `@playmarteloungebot` (owner: link + /revenue /consoles; platform God-Mode digest; push alerts — new
> booking / low stock / nightly brief / fraud + **owner alert-prefs toggles in Settings**, 0100–0105/0116/0122);
> **AI Concierge** now searches venues **by name** + knows live **tournaments** (0117/0118); **Gamer Passport** (player XP/level + computed badges on
> /account, 0112); **3-domain marketing repositioning** (martelounge.ge = B2B "Gaming Venue OS" for owners,
> play.martelounge.ge = B2C player brand + /tournaments + /live Pulse); **self-serve venues + price bump Pro 50/Ent 70
> (0077)**, **org cross-venue overview (0078/0079)**, **In-Seat session tab + itemized bill + extend→confirm (0086/0087)**,
> **guest AI Concierge (0085)**, **API keys + device gateway (0091/0092)**, and a **deep money-correctness audit** (stock
> guards, cash_expected accuracy, tournament-fee→revenue, 0097–0099/0110). Plus the earlier 0037–0076 wave (capacity/typed
> booking, plan entitlements, In-Seat portal, RevPACH+AI, hardware control, dynamic pricing, Pulse, Entertainment-Venue-OS
> billiard). Both sites bot-safe SEO + ISR; admin mobile-responsive + PWA._
>
> _**Latest wave (0123–0126, 2026-06-22):** **email no-show reminders** (pg_cron → Resend via pg_net, 0123);
> **launch-hardening** — the SENIOR_REVIEW P0+P1 tier closed (NEVER-token rotation, tsc CI gate, money-invariant +
> RLS-isolation + AI red-team proofs, **Sentry** client error-tracking on both apps + **uptime monitors**, incident
> runbook); **self-hosted uptime → founder Telegram** (pg_cron self-check, 0124); **Gemini AI cost metering** (per-org
> token/USD logging + God-Mode card, 0125); and the **Hardware LAN Agent** — a Python Pi daemon (`hardware/lan-agent/`)
> that drives venue LAN relays off the existing api-gateway, **built + proven end-to-end against prod** (poll/ack/heartbeat,
> 0126), pending only a physical relay test. The product is **launch-hardened**._
>
> _**Self-testing wave (2026-06-22, post-v2-review):** the money + RLS proofs are now a **CI regression GATE** —
> `supabase/tests/{money_invariants,rls_isolation}.sql` (rollback-only `SUITE_PASS/FAIL` blocks) run via
> `run_invariants.py` in `.github/workflows/db-invariants.yml` on every push/PR (8/8 green); the `tsc` check is now a
> **required** branch-protection gate; AI threat model documented (`SECURITY_AI_THREAT_MODEL.md`). The product now
> **defends its own money-correctness + tenant-isolation on every commit.**_
>
> _**Pre-onboarding audit wave (2026-06-25, through 0138):** a full backend audit (Supabase advisors + code) hardened
> the DB before first-venue onboarding. **Money suite grown to 9/9** (added end_session 5-min round-up + 1440 cap,
> cash_expected reconciliation, settle_tab single-sale + idempotency, 5% commission — 0135 passport-visit fix shipped
> too). **Performance:** all **53 unindexed FKs indexed** (0136) + **10 RLS policies hoist `(select auth.uid())`** (0137).
> **Security advisor remediated** (0138): revoked 14 secdef trigger fns from the RPC surface, closed an anon
> `cash_expected` cross-tenant leak, pinned `search_path` on 6 fns → advisor `function_search_path_mutable` 6→0,
> anon secdef-exec 33→17. **`callRpc` helper** (`lib/rpc.ts`) now folds soft `{error}` jsonb into the error channel,
> and **gen-types CI is a drift-CHECK** (no more bot-push fighting branch protection; types refreshed in sync with prod).
> **Known/by-design advisor residue (accepted):** 4 `security_definer_view` ERRORs = the curated anon marketplace
> projections (`public_venues/reviews/tournaments/venue_plans`; flipping to security_invoker would need anon base-table
> policies — break the public site); ~17 anon + ~121 authenticated secdef-exec WARNs = the intentional self-gated RPC
> architecture; 6 `rls_enabled_no_policy` = RPC-only locked tables (api_keys, payment creds, platform/telegram); pg_net
> in public; leaked-password protection OFF (owner dashboard toggle, recommended for B2C). **⛔ Only launch-blocker
> left: prod is on the Supabase FREE plan (`pitr_enabled:false`, no restorable backups) — owner DECIDED to upgrade to
> Pro at first-venue onboarding, not before (0 real venues = no data at risk yet).**_

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
- **CI gates (2 workflows):** `.github/workflows/typecheck.yml` runs `tsc --noEmit` on every push/PR to `main`
  — and is now a **REQUIRED** branch-protection status check (set 2026-06-22), so a broken type blocks a PR merge
  (solo direct-push to `main` still admin-bypasses; the red X is the signal). `.github/workflows/db-invariants.yml`
  runs the **money + RLS regression suites** (`supabase/tests/*.sql` via `run_invariants.py`) on every push/PR —
  rollback-only, safe against prod. Long-term: get admin type-clean, then drop `ignoreBuildErrors`.

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
  tournaments.tsx       Tournaments 2.0: groups+knockout / single-elim, TV mode, online registrations + QR scan
                        check-in, „ვირტუალური დოლორა" group draw, walk-ins, min-participants + 1st/2nd/3rd prizes,
                        tenant→Global promotion (proposes commission). God-Mode tournament create + host-offer accept
                        live in platform.tsx (PlatformTournaments + TenantPromotionRequests)
  telegram-settings.tsx Settings → Telegram: generate link code → owner sends /link CODE to @playmarteloungebot
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
supabase/functions/ai-assistant/index.ts   Gemini function-calling agent (runs as caller's JWT) + usage metering (0125)
supabase/functions/hardware-control/index.ts  cloud power dispatch (Shelly Cloud; service-role reads the Vault secret)
supabase/functions/telegram-bot/index.ts   @playmarteloungebot webhook — secret-token gated, /start /link /revenue
                                           /consoles; resolves the org by chat_id (service-role). Deploy --no-verify-jwt
supabase/functions/api-gateway/index.ts    public device relay (ESP32/Pi poll/ack/heartbeat, read sessions/analytics). --no-verify-jwt
hardware/lan-agent/     Hardware LAN Agent — Python Pi daemon (agent.py + install.sh + systemd + README). Drives venue
                        LAN relays off the api-gateway; cloud-authoritative, fail-safe. NOT deployed via CF (runs on a Pi).
supabase/migrations/    0001–0126 (see §7)
supabase/tests/         money_invariants.sql + rls_isolation.sql (rollback-only SUITE_PASS/FAIL blocks) +
                        run_invariants.py (CI runner). The db-invariants.yml gate runs these on every push.
(repo root)             INCIDENT_RUNBOOK.md (ops/rollback) · SECURITY_AI_THREAT_MODEL.md (AI P1-3) ·
                        SENIOR_REVIEW_HANDOFF{,_v2}.md (historical reviews — engineering tier closed)
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
| Tournaments 2.0 (groups+knockout, QR check-in, virtual draw, prizes, Global promotion) | `tournaments` | owner/admin/manager | ✅ |
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
  layout.tsx            brand header (Pulse · კლუბები · 🏆 ტურნირები · auth) / footer; Noto Sans Georgian
  page.tsx              player-brand home: hero "იპოვე შენი შემდეგი ბრძოლა" + search + tournaments band + passport band
                        + featured venues + how-it-works (public_venues + public_tournaments)
  venues/page.tsx       all venues
  [slug]/page.tsx       venue detail: profile, amenities, reviews (public_reviews), <BookingWidget/>
  tournaments/page.tsx  public tournaments (public_tournaments) — open-reg / coming / finished + register + prize breakdown
  live/page.tsx         Pulse — real-time public gaming census (get_pulse_stats) + venue_type category tabs
  account/page.tsx      auth-gated: GamerPassport (XP/level/badges) + bookings (QR pass + review) + tournament QR passes
  auth/login|register   email/password (auth-form.tsx)
components/
  venue-card.tsx        listing card (rating, price_from)
  booking-widget.tsx    live availability grid (get_venue_availability) → pick slot → duration/plan/payment
                        → create_marketplace_booking (handles booking_conflict)
  booking-pass.tsx      QR pass (qrcode.react, encodes "MLB:<bookingId>") for pending/confirmed bookings
  booking-review.tsx    star rating + comment → submit_review (one per completed booking)
  tournament-card.tsx   public tournament card (prize 1st/2nd/3rd, host venue link, participants)
  tournament-register.tsx  auth-gated online registration (valid mobile + email) → register_for_tournament
  my-tournament-passes.tsx GamerPassport + tournament QR passes (MTLT:<registration_id>) on /account
  pulse-live.tsx        live census client (polls get_pulse_stats), chat-concierge.tsx (guest AI)
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
0076  SPECIFIC-UNIT BOOKING: get_venue_consoles (per-console busy) + create_marketplace_booking p_console_id
      (optional). Customer can pin a specific PS5/table or keep "any"; pool capacity check still prevents oversell.
0077  SELF-SERVE VENUES + PRICE BUMP: create_venue(org,name,venue_type) owner-gated (is_org_admin), plan cap via
      enforce_venue_limit. Owner adds a venue from Settings ("ფილიალები") → 2nd cash register = 2nd venue (own
      Z-Report/bar/P&L for free). plan_monthly_price raised Pro 45→50 / Enterprise 65→70.
0078  ORG OVERVIEW: get_org_overview(org,today,week,month) — owner cross-venue revenue rollup (sessions+bar)
0079  ORG OVERVIEW + payment split (cash/card/transfer today, club-wide) in get_org_overview
0080  PORTAL bill prep: portal_get_session_status/unlock also return controllers + price_per_hour (joystick witness)
0081  public_venues.price_from is category-aware (billiard venue shows billiard min, not org-wide PS5 min)
0082  reusable console slots (partial-unique on deleted_at is null) — soft-deleted no longer blocks re-add
0083  PRICING SUB-TYPE: pricing_plans.console_type (standard/vip/snooker…); VIP is a playroom SUB-TYPE not a category;
      planAppliesToConsole(plan,consoleType) = class match AND sub-type match; public_venue_plans exposes console_type
0084  MID-SESSION TARIFF CHANGE: change_session_tier(session,plan) — fixed session re-converts remaining prepaid
      balance at the new rate (add joysticks mid-game, exact rebill); open rejected (segment accrual TODO)
0085  MARKETPLACE AI SEARCH: search_venues_for_ai + check_venue_availability_for_ai (anon, definer+search_path) for
      the guest AI Concierge (ai-assistant edge `guest_concierge` action; ChatConcierge in martelounge-web)
0086  SESSION TAB + ITEMIZED BILL (hybrid pay-now/at-end): bar_sales stay paid-only; unpaid tab = delivered
      service_requests, settled at end into one paid bar_sale (settle_session_tab); compute/get/portal_get_bill
0087  EXTEND REQUEST→CONFIRM: portal_request_extend (kind='extend') → operator confirm in inbox runs extend_session
─ money-correctness · ops · API ───────────────────────────────────────────────────────────────────────
0088–0090  in-seat tab/stock fixes        0091  API KEYS (per-owner + platform God-Mode; hash-only, scopes, revoke)
0092  `api-gateway` edge fn (device relay poll/ack for ESP32/Pi; read sessions/analytics; deploy --no-verify-jwt)
0093  booking-RPC drift fix (live 12-arg create_marketplace_booking + get_venue_consoles backfilled)
0094–0099  MONEY AUDIT: nonneg-stock trigger (pay-now oversell), drop orphan end_session(uuid), cashier refund
      accuracy, cash_expected timing/refunds (0098), create_bar_sale 8-arg method/bank validation (0099)
─ Telegram bot (@playmarteloungebot) ───────────────────────────────────────────────────────────────────
0100  TELEGRAM link: organizations.telegram_chat_id + telegram_alerts(jsonb) + telegram_link_codes +
      create_telegram_link_code / telegram_link / telegram_org_summary (service-role) — owner links via /link CODE
0101–0105  PUSH ALERTS: notify_telegram_org (Vault token + pg_net, toggle-gated) — new-booking trigger, low-stock,
      nightly brief cron, **platform God-Mode** link + new-tenant + daily digest (notify_platform_telegram), fraud flags;
      0104 pg_net timeout→15s
─ Tournaments 2.0 (platform-promoted) ───────────────────────────────────────────────────────────────────
0106  GROUP STAGE: format 'groups_knockout' — seed_group_stage (round-robin), report_match v2 (group draws),
      get_group_standings (3/1/0, tiebreaks), start_knockout_from_groups (reuses 0037 bracket)
0107  PLATFORM-CREATE + HOST-BIDDING: tournaments creator_scope/is_public/host_org_id/commission; nullable org/venue;
      tournament_host_offers; create_platform_tournament (+Telegram invite all owners) / submit_host_offer / accept_host_offer
0108  public_tournaments anon view (marketplace listing)
0109  REGISTRATION + DRAW: tournament_registrations (customer_id=auth.uid(), QR='MTLT:<id>') + register_for_tournament /
      checkin_tournament_registration (pay-at-venue) / draw_tournament_groups (server-fair random) + commission tracking
0110  pay-at-venue ENTRY FEE → revenue: posted as bar_sales (source='tournament'); PRO bar-gate relaxed (gate_bar_sale_plan)
0111  TENANT→GLOBAL promotion: promotion_status (pending→approved/rejected) + proposed_commission; submit/approve/reject_
      tournament_promotion + list_tenant_promotion_requests; public_tournaments gate = is_public; draw includes walk-ins
0112  GAMER PASSPORT: get_gamer_passport() — computed XP/level + 10 badges from bookings/tournaments/wins/reviews (no tables)
0113  tournament_participants + tournament_matches RLS += is_platform_admin (God-Mode view-as can read brackets)
0114  min_participants gate (draw blocked below min — anti-loss) + prize_second + prize_third_minutes (free play-time)
0115  registration HARDENED: register_for_tournament requires valid GE mobile + email (server-side); email on the row
0116  telegram link-code validity 10→30 min
─ AI concierge tools · tournament money loop · tiebreaks · telegram prefs ────────────────────────────────
0117  AI CONCIERGE venue search by NAME: search_venues_for_ai gains p_query (name/city/address ILIKE) + limit 3→8
0118  search_tournaments_for_ai (public_tournaments) — the guest AI now answers about live/upcoming tournaments
0119  TOURNAMENT PRIZE PAYOUT: award_tournament_prizes — 1st=prize_pool + 2nd=prize_second (money → expenses, P&L) +
      World-Cup BRONZE MATCH (report_match auto-creates a 3rd-place playoff) → 3rd=prize_third_minutes → customer_credits;
      idempotent via tournament_payouts; walk-ins flagged manual; get_my_credits() for /account
0120  CREDIT REDEMPTION (in-venue cashier): apply_credit_to_session(session,code) discounts price_total by the free
      minutes (forgone revenue, venue-scoped) + remove_credit_from_session; customer_credits.code + QR MTLC:<id>;
      compute_session_bill v3 keeps tab_extension + surfaces credit_discount
0121  FAIR GROUP TIEBREAKS: start_knockout_from_groups → jsonb + resolves boundary ties via head-to-head → PENALTIES
      (stage='tiebreak' decider, operator reports) → LOTS (stable random md5); report_match handles 'tiebreak' like 'bronze'
0122  TELEGRAM ALERT PREFS: set_telegram_alerts (owner/admin) + telegram_link_status v2 returns prefs → toggle UI in Settings
─ email reminders · launch-hardening · uptime · AI metering · LAN agent ──────────────────────────────────
0123  EMAIL NO-SHOW REMINDERS: notify_email(to,subj,html) (pg_net→Resend, Vault resend_api_key, from noreply@martelounge.ge)
      + send_booking_reminders() (upcoming pending/confirmed in (now,now+3h], reminder_sent_at guard) + notification_log;
      pg_cron 'booking-reminders' */30. SMS (Twilio) deferred. martelounge.ge verified in Resend.
0124  UPTIME SELF-CHECK → founder Telegram: platform_uptime_state + platform_uptime_check() (pg_cron */3 GETs app+play via
      pg_net; alerts on up↔down TRANSITION only via notify_platform_telegram('uptime') — de-dup, no spam). Complements the
      external Sentry uptime monitors (which also catch Supabase-down + email).
0125  AI USAGE / COST METERING: ai_usage_log + log_ai_usage (caller-JWT, resolves user+org, guests skipped) — callGemini
      meters every call fire-and-forget (EdgeRuntime.waitUntil, never blocks/breaks the AI) + get_ai_usage_stats
      (platform-admin; per-org tokens/calls + ESTIMATED USD at read-time) → God-Mode AiUsageCard (7/30-day).
0126  AGENT HEARTBEAT: api_device_heartbeat(org) bumps console_hardware.last_seen_at for 'agent' consoles (no power_event) +
      api-gateway route POST /v1/devices/heartbeat → the "agent online" signal for the Hardware LAN Agent (see §9).
─ (0127–0134: uptime/edge-log/loyalty/referral/telegram tuning — see supabase/migrations) ────────────────
0135  PASSPORT VISIT FIX: get_gamer_passport "visit" now = checked_in_at IS NOT NULL OR status='completed' (was NOT IN
      cancelled/no_show, which counted a not-yet-arrived pending booking as a visit). Same filter fixes venues + spend.
─ pre-onboarding hardening pass (2026-06-25 backend audit) ───────────────────────────────────────────────
0136  INDEX every unindexed FK (53): tenant org_id (RLS filters) + tournament bracket graph + session/bill links +
      marketplace FKs. Postgres doesn't auto-index FKs → was seq-scanning JOIN/CASCADE. Advisor "unindexed FK" → clean.
0137  RLS PERF: wrap bare auth.uid() → (select auth.uid()) across 10 policies (cc_read, mb/mc/mr own-row set,
      ref_earn_select, tr_read) → planner hoists to one initplan vs per-row (~100x at scale). Access logic identical.
0138  SECURITY ADVISOR hardening: revoke EXECUTE on 14 secdef TRIGGER fns from anon/authenticated (RPC surface; triggers
      still fire) + lock cash_expected/cash_opener_name (anon could read any venue's cash) + pin search_path on 6 fns.
─ billing UX + session-billing fairness (2026-06-26) ─────────────────────────────────────────────────────
0139  TENANT CONTACT + BANK-TRANSFER REFERENCE: organizations += contact_phone (REQUIRED at signup) / contact_email
      (auto from auth user) / billing_ref (MTL0001… serial). create_organization v2 + set_org_contact (platform-admin) +
      platform_org_overview exposes them → God-Mode shows email/phone + copyable ref + invoice prefill (amount × months).
0140  OPEN-SESSION mid-session TIER/JOYSTICK change: sessions += open_accrued + open_anchor_at. change_session_tier banks
      the played segment at the OLD rate + re-anchors → bills by SEGMENT (accrued + current rate), never re-prices past time;
      end_session / compute_session_bill / kill_abandoned all use accrued + segment. FIXED tier-change unchanged.
0141  FAIR EARLY-END (per-venue): venues.early_end_actual (default OFF). When ON, ending a FIXED session before ends_at
      bills only the actual time played (5-min round-up), CAPPED at the booked price_total. Settings toggle (RLS write).
```

> **Session-billing UI (no migration, same wave):** the dashboard now shows the bar tab + the joystick/tariff change on
> OPEN sessions too; the open timer RESETS to the current rate segment on a tier change (display matches segment billing);
> the End modal breaks down current-segment cost + the banked "წინა ტარიფი". The money suite grew to **11/11**
> (`open_tier_change_segment_billing`, `early_end_actual_fixed`) — and a dynamic-pricing BEFORE-INSERT flakiness in the
> fixtures was fixed by pinning the rate via UPDATE after each fixture INSERT.

> **AI assistant venue-scoping fix (no migration):** the chat's console/session/bar/reservation/expense reads relied on
> RLS alone (no `venue_id` filter), so a platform admin — who reads every org via RLS — got console counts aggregated
> across ALL orgs (e.g. "33" instead of the venue's 7). Now those reads `.eq('venue_id', venueId)`, and `venueId` prefers
> the client-sent current venue (`body.venue_id`, RLS-bounded) before falling back to the first venue. Edge fn redeployed.

> **UI brand credit (no migration):** an engraved/auto-pulsing "MARTE GROUP" parent-brand credit sits centered in the
> header (`nm-engraved` utility in globals.css — recessed fill + lit lower lip + accent breathe; `prefers-reduced-motion` aware).

> **Onboarding readiness (2026-06-27, no migration — freeze-allowed prep for the FIRST real venue):** the recs handoff
> `SENIOR_RECS_FOR_OPUS_2026-06-27.md` re-asserted the feature freeze (the bottleneck is a *committed* venue, not code).
> Allowed prep shipped: (1) **Excel DATA IMPORT** — Settings → "მონაცემების იმპორტი" (`components/admin/data-import.tsx`):
> per-type template download + upload → client-side parse (`lib/excel.readExcel`) + RLS-bound batch inserts of consoles /
> tariffs / customers, idempotent (skips dup name/phone), customers phone-validated client-side; the venue's Excel → live
> org without retyping (store now exposes `refreshPlans`). (2) **First-venue onboarding runbook** — `INCIDENT_RUNBOOK.md`
> §5b, owner-run step-by-step (gates → org/venue → import → config → go-live → public → God-Mode billing). (3) **Friction
> audit** — `ONBOARDING_FRICTION_AUDIT_2026-06-27.md` (untracked working doc): top friction was data import (now built);
> remaining P0 gates (PITR / RS.ge legal / leaked-pw / hardware) are owner-dependent.

> **⚠️ Frontend gotchas hit while building God-Mode/tournaments (2026-06-21):** (1) `const x = supabase.rpc` DETACHES
> `this` → "Cannot read … 'rest'" — always invoke as a member call (`(supabase as any).rpc(...)` or `.call(supabase,…)`).
> (2) Embedding `tournament_participants(count)` is AMBIGUOUS (two FKs: participants.tournament_id + tournaments.winner_
> participant_id) → PostgREST **300 Multiple Choices** → hint it: `tournament_participants!tournament_id(count)`.
> (3) Telegram push is **toggle-gated** — a new alert `kind` must be enabled in `telegram_alerts` / `platform_telegram_config.alerts`.

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
| `tournaments` / `tournament_participants` / `tournament_matches` | groups+knockout / single-elim; matches `stage` (group/knockout/**bronze**/**tiebreak**); tournaments += prize_second/prize_third_minutes/min_participants/promotion_status/commission_pct/**prizes_awarded_at** |
| `tournament_payouts` | per-(tournament,place) payout ledger, idempotent: participant_id, customer_id, place, prize_type (money/free_minutes), amount, minutes, expense_id, credit_id, **manual** (walk-in handed over by hand) |
| `customer_credits` | free play-time won (tournament 3rd prize): org_id, venue_id, customer_id, source, tournament_id, minutes, minutes_used, **code** (+ QR MTLC:<id>), status (active/redeemed/expired). RLS: own (customer_id=auth.uid) OR org member/platform. `sessions` gained credit_id/credit_minutes/credit_discount (applied at checkout) |
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

**Hardware control** (vendor-agnostic): `set_console_power(console,action,session?,trigger)` — member-gated, Force=admin; sets `desired_state` and for manual/no-device logs the event immediately. `log_power_event(...)` + `get_ghost_power_events(venue,from,to)` (anti-fraud). `save_hardware_credentials` / `get_hardware_settings` / `delete_hardware_credentials` (admin; Vault-backed) + **`get_hardware_secret`** (granted to **`service_role` only** — the Shelly auth_key, for the edge fn). `enforce_hardware_required` trigger blocks session start when `venues.hardware_required` and the console has no active hardware. Cloud devices dispatch via the `hardware-control` edge fn (Shelly Cloud); LAN relays via the **Hardware LAN Agent** (`hardware/lan-agent/`, BUILT — see §10) which polls `api_device_list` + acks `api_device_report` + `api_device_heartbeat` through the api-gateway.

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
  `power_events`. **Agent** (LAN relays — Shelly-LAN/Tasmota, USR/Waveshare, the Georgian "სოჩიკი") = the
  **Hardware LAN Agent** (`hardware/lan-agent/`, a Python systemd daemon, **BUILT + proven against prod 2026-06-22**):
  one Pi per venue PULLS `GET /v1/devices` (desired-state) → drives the LAN relay via a cloud-authoritative driver
  registry → acks `POST /v1/devices/state` + `…/heartbeat` (firewall-friendly; cloud can't reach 192.168.x.x).
  **Cloud-authoritative** (driver+config come from `console_hardware.config`, zero-config Pi), **fail-safe** (holds last
  state on network loss — never cuts a paying customer), owns only `control_mode='agent'` consoles. LIVE drivers:
  `shelly_lan` + `tasmota`; modbus/tcp/hdmi/unifi are registry stubs ("მალე"). ⏭️ only the physical relay test (owner
  buys a Pi+relay) + the "agent online" badge remain. ⚠️ the "სოჩიკი" relay may be Modbus/TCP → add that driver class
  when its model is confirmed. See `memory/hardware-control.md`.
- **Opt-in enforcement:** `venues.hardware_required` (default off). When on, a BEFORE-INSERT trigger on
  `sessions` blocks starting a session on a console with no active hardware (`hardware_required`). Anti-fraud
  read `get_ghost_power_events` flags a console powered on with no session (agent state-poll, Phase 3).

### Telegram bot (`@playmarteloungebot`, migrations 0100–0105 / 0116 / 0122)
- **ONE shared bot** for the whole platform — an owner does **NOT** build their own bot. They **LINK** their org:
  Settings → Telegram → „კოდის გენერაცია" (`create_telegram_link_code`, **30-min** code) → send `/link CODE` to the bot
  from their OWN Telegram → binds `organizations.telegram_chat_id` (one chat ↔ one org). Then `/revenue` · `/consoles`.
- Edge fn `telegram-bot` (webhook, `X-Telegram-Bot-Api-Secret-Token`-gated, service-role) resolves the org by `chat_id`
  via `telegram_link` / `telegram_org_summary`. A platform-scoped link (`platform_telegram_config`) drives God-Mode alerts.
- **PUSH alerts** via `notify_telegram_org` / `notify_platform_telegram` (Vault bot token + `pg_net`, 15s timeout,
  **toggle-gated** by `telegram_alerts->>kind`): new booking · low stock · nightly brief · fraud flags · platform
  new-tenant · daily digest · **tournament Global-promotion request**. Deploy `--no-verify-jwt`. See `memory/telegram-bot.md`.
- **Alert preferences (0122):** the owner picks which pushes the club gets via toggle switches in Settings → Telegram
  (`set_telegram_alerts`, admin-gated; `telegram_link_status` returns current prefs). Was SQL-only before.
- **🔒 Tenant-isolated (audited 2026-06-22):** a UNIQUE partial index binds one chat ↔ exactly one org; every summary/
  brief/alert filters by that org — one owner NEVER sees another's data.

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

**Plans** (`plan_monthly_price()` is the DB source of truth): trial (₾0, 14d) · **pro (₾50/mo)** ·
**enterprise (₾70/mo**, RS.GE fiscal+API). God-Mode billing (migration 0040) is LIVE: `mark_tenant_paid`
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
  Nameservers on Cloudflare (deborah/lennon.ns.cloudflare.com). CI: `typecheck.yml` (`tsc --noEmit`, a **required**
  branch-protection check) + `db-invariants.yml` (money + RLS regression suites, rollback-only) run on every push/PR.
- **Marketplace:** from `martelounge-web/`: `npx wrangler login` once, then **`npm run deploy`**
  (`opennextjs-cloudflare build && deploy`) → Worker at `play.martelounge.ge` (custom_domain auto-provisions DNS+SSL).
  Windows gotcha: if `.open-next` is EPERM-locked, stop workerd/wrangler + `Remove-Item -Recurse -Force .open-next` first.
- **Migrations:** applied to live via Supabase MCP `apply_migration` (or `db push`), then committed under
  `supabase/migrations/`; the `gen-types.yml` GitHub Action regenerates `lib/database.types.ts` on push.
  (Re-sync the marketplace repo's `lib/database.types.ts` copy after migrations.)
- **Secrets:** `SUPABASE_ACCESS_TOKEN` = a User-level Windows env var (**NEVER-expiring** as of 2026-06-22
  rotation; also a GitHub secret for CI). `GEMINI_API_KEY`, `resend_api_key` (Vault), `telegram_bot_token` (Vault),
  future `TBC_PAY_API_KEY`/`BOG_PAY_API_KEY` live ONLY as Supabase secrets/Vault. Publishable (anon) key only on the client.
- **Observability (2026-06-22):** **Sentry** client error-tracking on both apps (`martelounge-admin` + `martelounge-web`,
  errors-only, public DSNs) + **uptime monitors** on both domains; a **self-hosted uptime self-check → founder
  Telegram** (pg_cron 0124, **de-bounced** — alerts only after 2 consecutive fails, 0127); and **edge-function error
  capture** (0128) — all 4 edge fns (`ai-assistant`/`telegram-bot`/`hardware-control`/`api-gateway`) log unhandled
  errors fire-and-forget to `edge_error_log` (`log_edge_error`; founder reads via `get_edge_errors`). Rollback/diagnose
  playbook = `INCIDENT_RUNBOOK.md` (repo root); pre-first-venue staging checklist = its §5b.

---

## 14. Working agreement

| Who | Owns |
|---|---|
| **Claude** | migrations, DB schema, RLS, RPCs, edge functions, `database.types.ts`, `store.tsx`, `org.tsx`, `fiscal.ts`, marketplace backend, security-sensitive code |
| **Gemini / Sonnet** | UI components, layout, styling, client interactions, non-security frontend |

- Never change DB/RLS/migrations from the frontend — request it from Claude.
- Keep `payment_method`/`bank` (and marketplace status/payment) enums identical across modules.
- Admin: keep `npm run build` **and `npx tsc --noEmit`** green (build ignores TS errors; CI `typecheck.yml`
  runs `tsc --noEmit` on push/PR to main — make it a *required* branch-protection check to block merges). Web: `next build --webpack` green.
- Regenerate `lib/database.types.ts` after every migration (both repos).
- Never expose `service_role` client-side. Images → R2 (`uploadImage`), never Supabase Storage.
- Keep open-session rounding in sync between `end_session` and `openBillableMinutes()`.

---

## 15. Roadmap (remaining)

> ⛔ **FEATURE FREEZE in effect (2026-06-22 — see the Current-diagnosis callout up top).** Net-new feature
> surface is paused: breadth outran validation, so the priority is **harden the existing product + onboard the
> first ~10 Tbilisi venues**, not more code. The items below are the **backlog for AFTER venue density** (or when
> an external blocker like merchant keys clears) — don't pick them up as net-new work while the freeze holds.
> **Hardening is essentially closed:** P0/P1 launch-critical + v2's CI regression suites (money + RLS) are LIVE;
> the only deferred hardening item is a **paid staging branch** (do it just before the first real venue onboards).

- 💳 **Online payments — Phase 2** — live checkout + bank callbacks as edge functions (reuse the Kale-group
  BOG/TBC logic, per-tenant Vault keys) → set `payment_status='paid'`/`payment_ref`. Phase 1 (credential
  storage) is DONE (0058); Phase 2 is blocked on the owner obtaining merchant keys.
- 📲 **No-show reminders** — ✅ **EMAIL DONE & LIVE** (0123: pg_cron → Resend, martelounge.ge verified). **SMS** (Twilio)
  still pending a Twilio account.
- 🧠 **Proactive "AI Manager"** — ✅ largely DONE: AI Closing Brief (0070) + Telegram nightly brief + fraud flags
  (0102/0105). Remaining: one-tap actions from the Telegram message.
- 🏆 **Tournaments — Phase 4** — online PREPAYMENT of the entry fee (BYO TBC/BOG, blocked on keys). The rest of the
  product is **LIVE & complete**: groups+knockout, host-bidding, tenant→Global, QR check-in, virtual draw, min/prizes,
  **automatic prize payout** (1st/2nd money + bronze-match-decided 3rd free-time, 0119), **in-venue credit redemption**
  (0120), **fair group tiebreaks** h2h/penalties/lots (0121). Remaining nice-to-haves: online-booking credit discount
  (other surface), God-Mode create min/prize fields, marketplace rules/regulations reference (ცნობარი). Multi-venue = YAGNI.
- 🔌 **Hardware control — Phase 2/3** — local **Hardware LAN Agent** ✅ **BUILT + prod-proven** (`hardware/lan-agent/`,
  0124–0126: shelly_lan/tasmota drivers, poll/ack/heartbeat, fail-safe). Remaining: physical relay test (owner buys
  Pi+relay), "agent online" badge, and a Modbus/TCP driver IF the "სოჩიკი" relay needs it (confirm model first) +
  HDMI matrix + state-poll ghost detection. Foundation + Shelly Cloud done earlier (0063–0066).
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
