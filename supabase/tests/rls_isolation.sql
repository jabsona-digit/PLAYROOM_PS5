-- RLS cross-tenant isolation audit (P1-2 of the senior review).
--
-- WHY: the admin app talks to Supabase directly with the anon/auth key in the browser,
-- so RLS is the ONLY security boundary. One gap = direct cross-tenant data exposure via
-- the REST API. This file proves a member of org A can neither READ nor WRITE org B's rows.
--
-- METHOD: the Management API / postgres role BYPASSES RLS, so we impersonate a real tenant
-- user inside a transaction: `set local role authenticated` + `set local request.jwt.claims`
-- (auth.uid() reads the sub). Use a NON-platform-admin, single-org user (platform admins
-- bypass via is_platform_admin()). Everything runs in a rolled-back tx → no data mutated.
--
-- TEST FIXTURE (prod test data, 2026-06-22):
--   user A   = 926fa80c-… (member of NIKARAGUA org 9a9666d7 only; not a platform admin)
--   org B    = 0124e0bd-… (XOPA)  +  demo f5bdf043-… (both have data, A is not a member)
-- DEFINITION OF DONE for a new migration: add any new tenant table to the sweep list below.
--
-- Last run 2026-06-22: positive control 2/1/1; leak sweep EMPTY; INSERT denied; UPDATE 0. ✅

-- ── 1) positive control: user A DOES see their own org (proves the harness reads data) ──
-- EXPECT: own_sess=2, own_venues=1, own_books=1
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}';
  select
    (select count(*) from public.sessions             where org_id='9a9666d7-8346-4b0f-97bb-919a1a50c1df') own_sess,
    (select count(*) from public.venues               where org_id='9a9666d7-8346-4b0f-97bb-919a1a50c1df') own_venues,
    (select count(*) from public.marketplace_bookings where org_id='9a9666d7-8346-4b0f-97bb-919a1a50c1df') own_books;
rollback;

-- ── 2) READ leak sweep: as user A, count rows of org B + demo on every SELECT-granted
--       tenant table. EXPECT: zero rows returned (no table leaks another org's data).
--       (api_keys / org_payment_credentials / telegram_link_codes have NO authenticated
--        grant; employees has no SELECT — all four are locked harder than RLS, so omitted.)
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}';
  select tbl, n from (
    select 'audit_logs' tbl, count(*) n from public.audit_logs where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'bar_categories', count(*) from public.bar_categories where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'bar_products', count(*) from public.bar_products where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'bar_sale_items', count(*) from public.bar_sale_items where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'bar_sales', count(*) from public.bar_sales where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'cash_drawers', count(*) from public.cash_drawers where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'cash_reconciliations', count(*) from public.cash_reconciliations where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'console_hardware', count(*) from public.console_hardware where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'consoles', count(*) from public.consoles where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'customer_credits', count(*) from public.customer_credits where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'customers', count(*) from public.customers where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'dynamic_pricing_rules', count(*) from public.dynamic_pricing_rules where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'expenses', count(*) from public.expenses where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'hardware_credentials', count(*) from public.hardware_credentials where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'invoices', count(*) from public.invoices where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'marketplace_bookings', count(*) from public.marketplace_bookings where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'marketplace_reviews', count(*) from public.marketplace_reviews where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'org_invites', count(*) from public.org_invites where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'org_members', count(*) from public.org_members where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'payroll_runs', count(*) from public.payroll_runs where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'platform_payments', count(*) from public.platform_payments where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'power_events', count(*) from public.power_events where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'pricing_plans', count(*) from public.pricing_plans where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'reservations', count(*) from public.reservations where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'service_requests', count(*) from public.service_requests where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'session_extensions', count(*) from public.session_extensions where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'sessions', count(*) from public.sessions where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'shifts', count(*) from public.shifts where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournament_groups', count(*) from public.tournament_groups where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournament_host_offers', count(*) from public.tournament_host_offers where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournament_matches', count(*) from public.tournament_matches where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournament_participants', count(*) from public.tournament_participants where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournament_payouts', count(*) from public.tournament_payouts where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'tournaments', count(*) from public.tournaments where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'venue_budgets', count(*) from public.venue_budgets where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
    union all select 'venues', count(*) from public.venues where org_id in ('0124e0bd-e350-454b-891e-17e19a2b16e6','f5bdf043-9e6a-4efd-928c-109aead87dfb')
  ) z where n > 0 order by tbl;
rollback;

-- ── 3a) WRITE isolation — cross-org INSERT must be denied (RLS WITH CHECK) ─────
-- EXPECT: ERROR "new row violates row-level security policy for table customers"
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}';
  insert into public.customers (org_id, name) values ('0124e0bd-e350-454b-891e-17e19a2b16e6', 'rls-write-test');
rollback;

-- ── 3b) WRITE isolation — cross-org UPDATE affects 0 rows (RLS USING hides them) ─
-- EXPECT: cross_org_session_updates = 0
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}';
  with u as (update public.sessions set tip_amount=tip_amount where org_id='0124e0bd-e350-454b-891e-17e19a2b16e6' returning 1)
    select count(*) as cross_org_session_updates from u;
rollback;
