# Playroom OS — Project Overview

> Multi-tenant SaaS admin panel for Georgian entertainment venues (PS5 lounges, bars).
> Built to replace the Excel sheets these businesses use today.
> Landing page: **runabe.com** (external). Signup + org creation lives in this app.

This document is the single source of truth for anyone (human or AI) joining the
project. **Backend = Claude (Supabase/DB/RLS/RPC). Frontend = Gemini 3.1 Pro / Sonnet.**
See `TODO_GEMINI_FRONTEND.md` for pending frontend tasks.

---

## 1. Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (CSS-first, `@theme` in `app/globals.css`) + custom neumorphic utilities
- **lucide-react** icons
- **Supabase** — Postgres + Auth + Realtime (project ref `rvlkimzqzwizcivkxtnd`)
- `@supabase/supabase-js` browser client (app is fully client-side, `'use client'`)
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
  `is_org_member(org)`, `is_org_admin(org)`, `is_platform_admin()`.
- **Auth:** Supabase Auth (email/password). After login, `OrgProvider` loads memberships + venues.
  No membership → onboarding (`create_organization` RPC).
- Founder `j19mt85@gmail.com` auto-gets platform_admin + owner of "Playroom (Demo)" org
  via `trg_bootstrap_founder` trigger on signup.
- **Impersonation (God Mode):** platform admin calls `setCurrentOrg(id)` → RLS allows via
  `is_platform_admin()`. Amber `ImpersonationBar` shows it. No minted tenant token — audit is clean.

---

## 3. Directory map

```
app/
  globals.css            # Tailwind v4 @theme + neumorphic utilities
  layout.tsx             # fonts (Noto Sans Georgian), dark theme
  page.tsx               # <AdminShell/>

components/admin/
  admin-shell.tsx        # auth gate → OrgProvider → (Splash|Onboarding|Workspace)
                         # ImpersonationBar (amber God Mode banner)
  login.tsx              # sign-in + sign-up
  onboarding.tsx         # create_organization RPC
  venue-switcher.tsx     # topbar venue dropdown
  sidebar.tsx            # nav (Crown "პლატფორმა" shown only for isPlatformAdmin)
  topbar.tsx             # title/subtitle + bell badge (expiring consoles)
  dashboard.tsx          # consoles grid, countdowns, StartSessionModal
                         # (payment method + bank selector; fiscal receipt on end)
  cashier.tsx            # period revenue (sessions + bar) + payment-channel breakdown
                         # + Z-report + shift open/close modal
  history.tsx            # completed sessions log
  pricing.tsx            # price plan management
  employees.tsx          # clock-in/out, shifts journal
  settings.tsx           # general settings + console management + fiscal settings toggle
  platform.tsx           # God Mode: tenant list, MRR, plan/suspend, view-as impersonation
  billing.tsx            # tenant billing: current plan, trial countdown, plan comparison, upgrade CTA
  analytics.tsx          # monthly profit bar chart + hourly heatmap (custom CSS/SVG, no lib)
  pos.tsx                # Bar POS: product grid, cart, barcode scanner, fiscal/regular receipt
  inventory.tsx          # bar_products + bar_categories CRUD
  customers.tsx          # customer loyalty: points, visits, discounts
  modal.tsx toast.tsx

lib/
  supabase/client.ts     # browser Supabase client
  database.types.ts      # generated types — regenerate after every migration
  types.ts               # domain types: ConsoleUnit, Session, PaymentMethod, Bank,
                         # Venue, OrgRole, ModuleKey, FiscalVenueSettings…
  org.tsx                # OrgProvider/useOrg — org/venue/role/isPlatformAdmin/impersonating
  store.tsx              # PlayroomProvider/usePlayroom — consoles, sessions, plans, actions
  ui.ts                  # gel(), statusMeta, paymentMethodLabel, date helpers
  notify.ts              # Web Audio alerts
  print.ts               # printReceipt() + printKitchenTicket() — 80mm thermal via window.print()
  fiscal.ts              # useFiscal() hook + printFiscalReceipt() — RS.GE Phase B (PDF/print)
                         # Phase C (future): replace with Bridge Agent → Daisy hardware

supabase/migrations/
  0001  initial schema
  0002  pgcrypto search_path fix + FK indexes
  0003  multi-tenant (orgs/venues/members/platform_admins + org_id on all + RLS overhaul)
  0004  per-venue slot_number unique
  0005  sessions.payment_method + bank + updated start_session
  0006  bar POS (bar_categories, bar_products, bar_sales, bar_sale_items, create_bar_sale)
  0007  inventory expansion (barcode, image_url, stock, cost_price, session_id on bar_sales,
        customers table, updated create_bar_sale)
  0008  platform_org_overview view (security_invoker)
  0009  fiscal_enabled/tin/business_name/address on venues + fiscal_receipt_seq +
        next_fiscal_receipt_no() RPC
  0010  audit_logs table + log_audit() SECURITY DEFINER + triggers on
        sessions / bar_sales / shifts / venues (captures start/end/extend,
        bar sales, clock-in/out, fiscal toggle, venue rename)
  0011  void_bar_sale() + refund_session() RPCs — partial indexes on voided/
        refunded rows; role-gated (owner/admin/manager only); stock rollback
  0012  composite indexes: (venue_id,status), (venue_id,ended_at), (venue_id,started_at),
        (venue_id,created_at) bar_sales, bar_products active partial,
        shifts active partial, shifts (venue_id,work_date)
  0013  expenses table (categories: rent/salary/utilities/supplies/marketing/maintenance/other)
        add_expense() / delete_expense() RPCs (manager+ only), get_venue_pnl(venue,from,to) → jsonb,
        monthly_pnl view (security_invoker, full join sessions+bar_sales+expenses)
  0014  reservations table (console_id INTEGER FK, status pending/confirmed/cancelled/completed,
        session_id FK for when customer arrives, customer_name/phone, start_time, duration_min)
        create_reservation() / confirm_reservation() / cancel_reservation() RPCs,
        partial index on active statuses (pending/confirmed), audit logged
  0016  soft delete: deleted_at timestamptz on consoles + customers;
        delete_console(id integer) — blocks if active session exists, soft-deletes + audit;
        delete_customer(id uuid) — soft-deletes + audit;
        RLS on consoles/customers updated: members see WHERE deleted_at IS NULL;
        platform admin sees all (for history). removeConsole() in store now calls RPC.
  0015  tip_amount column on sessions + bar_sales (default 0, check ≥ 0);
        end_session(p_session_id, p_tip?) updated to record tip;
        create_bar_sale(…, p_tip?) updated;
        get_venue_pnl() returns session_tips + bar_tips in breakdown;
        monthly_pnl view refreshed with session_tips + bar_tips columns
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
| `text-glow` | primary color text glow |

- Radii: `rounded-2xl` / `rounded-3xl`. Icons: lucide `size-4`/`size-5`.
- Colors: `text-primary`, `text-muted-foreground`, `var(--status-free/active/warning10/warning5/expired)`, `var(--surface-2)`.
- Money: `gel(n)` from `@/lib/ui` — honors `settings.currency`.
- **All UI text is Georgian (ka).** Match the existing tone and vocabulary.

---

## 5. State management

```typescript
useOrg()       → currentOrgId, currentVenueId, venues, currentRole, isPlatformAdmin,
                 impersonating, orgs, memberOrgIds,
                 setCurrentOrg, setCurrentVenue, stopImpersonating, refresh

usePlayroom()  → consoles, plans, employees, shifts, completed, settings, toasts
                 + startSession, extendSession, endSession, clockToggle,
                   updatePlanPrice, addConsole, renameConsole, pushToast, tick…

useFiscal()    → fiscalEnabled, fiscalSettings, saveFiscalSettings,
                 issueReceipt(items, total, method)
```

- Every query in `usePlayroom` is scoped to `currentVenueId` / `currentOrgId`.
- Mutations go through **RPCs** (server computes totals — never trust the client).
- Realtime on `consoles` / `sessions` triggers debounced refetch.

---

## 6. Data model

### Core tables
| Table | Key columns |
|---|---|
| `organizations` | id, name, plan, subscription_status, trial_ends_at |
| `venues` | id, org_id, name, is_active, **fiscal_enabled, fiscal_tin, fiscal_business_name, fiscal_address** |
| `org_members` | org_id, user_id, role |
| `platform_admins` | user_id |

### Gaming
| Table | Key columns |
|---|---|
| `consoles` | id, org_id, venue_id, slot_number, name, status |
| `sessions` | id, org_id, venue_id, console_id, pricing_plan_id, payment_method, bank, price_total, status |
| `session_extensions` | session_id, extra_minutes, extra_price |
| `pricing_plans` | id, org_id, name, type, price_per_hour, controllers |
| `employees` | id, org_id, name, role, pin_hash |
| `shifts` | id, org_id, venue_id, employee_id, clock_in, clock_out, hours_worked |

### Bar / POS
| Table | Key columns |
|---|---|
| `bar_categories` | id, org_id, name, parent_id, sort_order |
| `bar_products` | id, org_id, category_id, name, price, cost_price, stock_quantity, low_stock_threshold, barcode, image_url |
| `bar_sales` | id, org_id, venue_id, payment_method, bank, total, session_id |
| `bar_sale_items` | sale_id, product_id, name, qty, unit_price, unit_cost_price, line_total |

### Customers
| Table | Key columns |
|---|---|
| `customers` | id, org_id, name, phone, points, visit_count, total_spent, discount_pct |

### Audit
| Table | Key columns |
|---|---|
| `audit_logs` | id (bigserial), org_id, venue_id, actor_id, actor_email, action, entity_type, entity_id (text — handles int+uuid), payload (jsonb), created_at |

Actions logged automatically via triggers: `session.start/end/extend`, `bar_sale.create`, `employee.clock_in/out`, `fiscal.enable/disable`, `venue.rename`.
RLS: platform admins read all; org admins read own org.

### Views (security_invoker)
`session_revenue`, `console_stats`, `daily_revenue`, `period_revenue`, `platform_org_overview`

### RPCs
`start_session`, `extend_session`, `end_session`, `clock_toggle(pin, venue_id)`,
`set_employee_pin`, `create_organization`, `create_bar_sale`,
`next_fiscal_receipt_no()` → `GE-YYYYMMDD-XXXXXX`,
`log_audit()` (SECURITY DEFINER, revoked from clients — triggers only),
`void_bar_sale(sale_id, reason?)`, `refund_session(session_id, reason?, amount?)`,
`add_expense(venue_id, category, amount, description?, date?)` → uuid,
`delete_expense(expense_id)`,
`get_venue_pnl(venue_id, from, to)` → `VenuePnl` jsonb,
`create_reservation(venue_id, customer_name, start_time, duration_min, console_id?, phone?, notes?)` → uuid,
`confirm_reservation(reservation_id)`,
`cancel_reservation(reservation_id, reason?)`,
`is_org_member`, `is_org_admin`, `is_platform_admin`

### Payment channel (shared everywhere money is taken)
`payment_method ∈ {cash, card, transfer}`, `bank ∈ {TBC, BOG}` (null iff cash).
On `sessions` and `bar_sales`. Shown in modals + cashier; feeds accounting.

---

## 7. Modules & Status

| Module | Key | Status |
|---|---|---|
| Dashboard (consoles grid) | `dashboard` | ✅ |
| Bar POS | `pos` | ✅ |
| Cashier (sessions + bar revenue) | `cashier` | ✅ |
| Session history | `history` | ✅ |
| Pricing plans | `pricing` | ✅ |
| Inventory (products + categories) | `inventory` | ✅ |
| Customers (loyalty/points) | `customers` | ✅ |
| Employees (clock-in/out) | `employees` | ✅ |
| Settings + fiscal toggle | `settings` | ✅ |
| Analytics (charts + heatmap) | inside `dashboard` | ✅ |
| Platform God Mode | `platform` | ✅ |
| Billing (plan/trial/upgrade) | `billing` | ✅ |
| RS.GE Fiscal — Phase B (PDF) | `lib/fiscal.ts` | ✅ |
| Audit Log | `lib/types.ts → AuditLog` | ✅ |
| Refund / Void | `void_bar_sale()`, `refund_session()` RPCs | ✅ |
| Accounting (expenses + P&L) | `accounting` | ✅ DB / 🔲 UI |
| Reservations | `reservations` | ✅ DB / 🔲 UI |
| RS.GE Fiscal — Phase C (hardware bridge) | — | 🔲 |
| Auto-billing (TBC Pay / BOG) | — | 🔲 |

---

## 8. RS.GE Fiscal — Architecture

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

## 9. Billing & Plans

| Plan | Price | Limits |
|---|---|---|
| trial | ₾0 | 1 venue, 4 consoles, 3 employees, 14 days |
| pro | ₾99/mo | 3 venues, 8 consoles/venue, unlimited employees + bar + inventory |
| enterprise | ₾299/mo | unlimited + RS.GE fiscal + API + priority support |

Upgrade flow: **manual/invoice** (WhatsApp CTA → `wa.me/995599000000`).
Platform admin changes plan in God Mode console. Auto-billing (TBC Pay) — future.

---

## 10. Working agreement

| Who | Owns |
|---|---|
| **Claude** | `supabase/migrations/*`, DB schema, RLS policies, RPCs, `lib/database.types.ts`, `lib/store.tsx`, `lib/fiscal.ts`, security-sensitive backend, `lib/org.tsx` |
| **Gemini / Sonnet** | UI components, layout, styling, client interactions, non-security frontend |

**Rules:**
- Never change DB/RLS/migrations from the frontend side — request it from Claude.
- Keep `payment_method` / `bank` enum identical across all modules.
- Keep `npm run build` + `npx tsc --noEmit` green before handing off.
- Never expose `service_role` key client-side — only the publishable key.
- `lib/fiscal.ts` `issueReceipt()` is the single entry point for all receipt printing when fiscal is on. Don't call `printFiscalReceipt()` directly from components.
