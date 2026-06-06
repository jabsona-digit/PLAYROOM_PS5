-- 0017 — Enforce tenant suspension.
-- Bug: platform admin sets organizations.subscription_status='canceled' (suspend),
-- but is_org_member/is_org_admin only checked membership, never the subscription
-- status. So suspended tenants kept full read/write access (RLS + SECURITY DEFINER
-- RPCs all route through these two predicates). Fix: bake the active-subscription
-- check into both predicates. A separate *_raw predicate keeps org/venue/member
-- rows visible so a suspended user can still see the "suspended" screen.

-- ---------------------------------------------------------------------------
-- 1. Raw membership (status-agnostic) — only for org-visibility reads
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member_raw(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.org_members
     where org_id = p_org and user_id = auth.uid()
  );
$$;
revoke all on function public.is_org_member_raw(uuid) from public, anon;
grant execute on function public.is_org_member_raw(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Suspension-aware predicates (used by every data policy + every RPC gate)
--    A tenant is operational unless subscription_status = 'canceled'.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1
      from public.org_members m
      join public.organizations o on o.id = m.org_id
     where m.org_id = p_org
       and m.user_id = auth.uid()
       and o.subscription_status <> 'canceled'
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1
      from public.org_members m
      join public.organizations o on o.id = m.org_id
     where m.org_id = p_org
       and m.user_id = auth.uid()
       and m.role in ('owner', 'admin')
       and o.subscription_status <> 'canceled'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Keep org / venue / member rows VISIBLE to a suspended member (read-only),
--    so the frontend can render the "suspended" screen instead of onboarding.
--    Everything operational stays gated by the suspension-aware predicates.
-- ---------------------------------------------------------------------------
drop policy "org_read" on public.organizations;
create policy "org_read" on public.organizations for select to authenticated
  using (is_org_member_raw(id) or is_platform_admin());

drop policy "venue_read" on public.venues;
create policy "venue_read" on public.venues for select to authenticated
  using (is_org_member_raw(org_id) or is_platform_admin());

drop policy "member_read" on public.org_members;
create policy "member_read" on public.org_members for select to authenticated
  using (is_org_member_raw(org_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. delete_console / delete_customer gate on a direct role lookup (they never
--    called is_org_member), so add an explicit suspension guard.
-- ---------------------------------------------------------------------------
create or replace function public.delete_console(p_console_id integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
  v_role     text;
begin
  select org_id, venue_id into v_org_id, v_venue_id
  from public.consoles
  where id = p_console_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;

  -- suspended tenants are frozen
  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

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

  update public.consoles set deleted_at = now() where id = p_console_id;

  perform public.log_audit(
    v_org_id, v_venue_id, 'console.delete', 'console', p_console_id::text, null
  );
end;
$$;

create or replace function public.delete_customer(p_customer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_role   text;
begin
  select org_id into v_org_id
  from public.customers
  where id = p_customer_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;

  -- suspended tenants are frozen
  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  select role into v_role
  from public.org_members
  where org_id = v_org_id and user_id = auth.uid();
  if v_role not in ('owner','admin','manager') and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  update public.customers set deleted_at = now() where id = p_customer_id;

  perform public.log_audit(
    v_org_id, null, 'customer.delete', 'customer', p_customer_id::text, null
  );
end;
$$;
