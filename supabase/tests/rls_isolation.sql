-- RLS cross-tenant isolation regression SUITE (senior-review P1-2).
--
-- WHY: the admin app talks to Supabase directly with the anon/auth key in the browser, so
-- RLS is the ONLY security boundary. One gap = direct cross-tenant exposure via the REST API.
-- These tests prove a member of org A can neither READ nor WRITE org B's rows.
--
-- METHOD: the Management API / postgres role BYPASSES RLS, so each block IMPERSONATES a real
-- tenant user — set_config('role','authenticated') + set_config('request.jwt.claims', sub=A)
-- (auth.uid() reads sub). A is a NON-platform-admin, single-org user (platform admins bypass).
-- Each block RAISEs SUITE_PASS/SUITE_FAIL → everything rolls back (no data mutated, role reset).
-- Graded by run_invariants.py (CI .github/workflows/db-invariants.yml).
--
-- FIXTURE (prod test data): user A = 926fa80c-... (member of NIKARAGUA org 9a9666d7 only);
-- foreign orgs = XOPA 0124e0bd-... + demo f5bdf043-... (A is not a member of either).
-- DEFINITION OF DONE for any new tenant table: add it to the leak-sweep union below.
-- (api_keys / org_payment_credentials / telegram_link_codes / employees have NO authenticated
--  SELECT grant — locked harder than RLS — so they are intentionally omitted from the sweep.)

-- @@TEST rls_positive_control
-- Proves the harness actually READS under RLS (so an empty leak-sweep isn't a false pass):
-- user A must see their OWN org's rows.
do $$
declare v_ven int; v_sess int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into v_ven  from public.venues   where org_id = '9a9666d7-8346-4b0f-97bb-919a1a50c1df';
  select count(*) into v_sess from public.sessions where org_id = '9a9666d7-8346-4b0f-97bb-919a1a50c1df';
  if v_ven < 1 then v_fail := v_fail || format(' own_venues=%s(exp>=1 — fixture user/org missing?)', v_ven); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL rls_positive_control%', v_fail;
  else raise exception 'SUITE_PASS rls_positive_control own_venues=% own_sess=%', v_ven, v_sess; end if;
end $$;

-- @@TEST rls_read_leak_sweep
-- As user A, count org B + demo rows on every SELECT-granted tenant table. MUST be zero.
do $$
declare v_leak bigint; v_off text;
begin
  perform set_config('request.jwt.claims', '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  select coalesce(sum(n), 0), string_agg(case when n > 0 then tbl || '=' || n::text end, ',')
    into v_leak, v_off
  from (
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
  ) z;
  if v_leak <> 0 then raise exception 'SUITE_FAIL rls_read_leak_sweep leaked: %', v_off;
  else raise exception 'SUITE_PASS rls_read_leak_sweep no_cross_org_rows'; end if;
end $$;

-- @@TEST rls_write_insert_denied
-- As user A, a cross-org INSERT must be blocked by the RLS WITH CHECK policy.
do $$
declare v_res text;
begin
  perform set_config('request.jwt.claims', '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  begin
    -- valid phone so the customer-validation trigger (0129) passes -> RLS WITH CHECK is what blocks
    insert into public.customers (org_id, name, phone) values ('0124e0bd-e350-454b-891e-17e19a2b16e6', 'rls-write-test', '555000111');
    v_res := 'INSERT_ALLOWED';
  exception when others then v_res := SQLERRM; end;
  if v_res not ilike '%row-level security%' then raise exception 'SUITE_FAIL rls_write_insert_denied got=%', v_res;
  else raise exception 'SUITE_PASS rls_write_insert_denied cross_org_insert_blocked_by_RLS'; end if;
end $$;

-- @@TEST rls_write_update_zero
-- As user A, a cross-org UPDATE must affect 0 rows (RLS USING hides them).
do $$
declare v_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"926fa80c-b19d-4fb8-b493-dc5604de78e3","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
  with u as (update public.sessions set tip_amount = tip_amount where org_id = '0124e0bd-e350-454b-891e-17e19a2b16e6' returning 1)
    select count(*) into v_cnt from u;
  if v_cnt <> 0 then raise exception 'SUITE_FAIL rls_write_update_zero cross_org_updates=%', v_cnt;
  else raise exception 'SUITE_PASS rls_write_update_zero cross_org_update=0'; end if;
end $$;
