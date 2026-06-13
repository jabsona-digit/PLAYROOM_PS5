-- 0016_soft_delete
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606190342). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0016: Soft Delete — consoles + customers
-- bar_products/employees/pricing_plans already use is_active.
-- consoles and customers get deleted_at for safe removal with
-- full history preservation.
-- ============================================================

-- ── CONSOLES ─────────────────────────────────────────────
alter table public.consoles
  add column deleted_at timestamptz default null;

-- Partial index: fast lookup of live consoles
create index consoles_live_idx
  on public.consoles (venue_id, slot_number)
  where deleted_at is null;

-- ── CUSTOMERS ────────────────────────────────────────────
alter table public.customers
  add column deleted_at timestamptz default null;

create index customers_live_idx
  on public.customers (org_id)
  where deleted_at is null;

-- ============================================================
-- delete_console(p_console_id integer)
-- Manager+. Refuses if console has an active session.
-- Sets deleted_at; console disappears from live queries.
-- ============================================================
create or replace function public.delete_console(
  p_console_id integer
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
  v_role     text;
begin
  select org_id, venue_id into v_org_id, v_venue_id
  from public.consoles
  where id = p_console_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;

  -- manager+
  select role into v_role
  from public.org_members
  where org_id = v_org_id and user_id = auth.uid();
  if v_role not in ('owner','admin','manager') and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- block if session is currently active
  if exists (
    select 1 from public.sessions
    where console_id = p_console_id and status = 'active'
  ) then raise exception 'console_has_active_session'; end if;

  update public.consoles
  set deleted_at = now()
  where id = p_console_id;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'console.delete', 'console', p_console_id::text, null
  );
end;
$$;

grant execute on function public.delete_console(integer) to authenticated;

-- ============================================================
-- delete_customer(p_customer_id uuid)
-- Manager+. Soft-deletes; loyalty history preserved.
-- ============================================================
create or replace function public.delete_customer(
  p_customer_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
  v_role   text;
begin
  select org_id into v_org_id
  from public.customers
  where id = p_customer_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;

  select role into v_role
  from public.org_members
  where org_id = v_org_id and user_id = auth.uid();
  if v_role not in ('owner','admin','manager') and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  update public.customers
  set deleted_at = now()
  where id = p_customer_id;

  perform public.log_audit(
    v_org_id, null,
    'customer.delete', 'customer', p_customer_id::text, null
  );
end;
$$;

grant execute on function public.delete_customer(uuid) to authenticated;

-- ============================================================
-- Update RLS on consoles: hide soft-deleted from members
-- Platform admin still sees everything (for audit/reporting)
-- ============================================================

-- Drop and recreate the member select policy to filter deleted
do $$
declare
  pol_name text;
begin
  for pol_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'consoles'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.consoles', pol_name);
  end loop;
end;
$$;

create policy "org member reads live consoles"
  on public.consoles for select to authenticated
  using (
    deleted_at is null
    and (is_org_member(org_id) or is_platform_admin())
  );

create policy "platform admin reads all consoles"
  on public.consoles for select to authenticated
  using (is_platform_admin());

-- ============================================================
-- Update RLS on customers: hide soft-deleted from members
-- ============================================================
do $$
declare
  pol_name text;
begin
  for pol_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'customers'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.customers', pol_name);
  end loop;
end;
$$;

create policy "org member reads live customers"
  on public.customers for select to authenticated
  using (
    deleted_at is null
    and is_org_member(org_id)
  );

create policy "platform admin reads all customers"
  on public.customers for select to authenticated
  using (is_platform_admin());
