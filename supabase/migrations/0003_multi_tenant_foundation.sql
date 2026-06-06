-- Phase 0 — Multi-tenant foundation.
-- Model: Organization -> Venues. Every domain row is scoped by org_id (+ venue_id
-- where relevant). RLS switches from "any authenticated" to org-membership based.
-- A platform_admin (God Mode) can cross tenant boundaries.

-- ---------------------------------------------------------------------------
-- 1. Tenant core
-- ---------------------------------------------------------------------------

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique,
  plan                text not null default 'trial'
                        check (plan in ('trial', 'pro', 'enterprise')),
  subscription_status text not null default 'trialing'
                        check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at       timestamptz default (now() + interval '14 days'),
  created_at          timestamptz not null default now()
);

create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index venues_org_id_idx on public.venues(org_id);

create table public.org_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'operator'
               check (role in ('owner', 'admin', 'manager', 'cashier', 'operator')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members(user_id);

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Helper predicates (SECURITY DEFINER -> bypass RLS, so no policy recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.org_members
     where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.org_members
     where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;

revoke all on function public.is_org_member(uuid)   from public, anon;
revoke all on function public.is_org_admin(uuid)    from public, anon;
revoke all on function public.is_platform_admin()   from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid)  to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scope existing tables
-- ---------------------------------------------------------------------------

alter table public.pricing_plans
  add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.employees
  add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.session_extensions
  add column org_id uuid references public.organizations(id) on delete cascade;
alter table public.consoles
  add column org_id   uuid references public.organizations(id) on delete cascade,
  add column venue_id uuid references public.venues(id) on delete cascade;
alter table public.sessions
  add column org_id   uuid references public.organizations(id) on delete cascade,
  add column venue_id uuid references public.venues(id) on delete cascade;
alter table public.shifts
  add column org_id   uuid references public.organizations(id) on delete cascade,
  add column venue_id uuid references public.venues(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing demo rows into a default org/venue
-- ---------------------------------------------------------------------------

do $$
declare
  v_org   uuid;
  v_venue uuid;
begin
  insert into public.organizations (name, slug, plan, subscription_status)
    values ('Playroom (Demo)', 'demo', 'enterprise', 'active')
    returning id into v_org;
  insert into public.venues (org_id, name)
    values (v_org, 'მთავარი ფილიალი')
    returning id into v_venue;

  update public.pricing_plans      set org_id = v_org where org_id is null;
  update public.employees          set org_id = v_org where org_id is null;
  update public.consoles           set org_id = v_org, venue_id = v_venue where org_id is null;
  update public.sessions           set org_id = v_org, venue_id = v_venue where org_id is null;
  update public.shifts             set org_id = v_org, venue_id = v_venue where org_id is null;
  update public.session_extensions se set org_id = v_org
    from public.sessions s where se.session_id = s.id and se.org_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Enforce NOT NULL + index
-- ---------------------------------------------------------------------------

alter table public.pricing_plans      alter column org_id set not null;
alter table public.employees          alter column org_id set not null;
alter table public.session_extensions alter column org_id set not null;
alter table public.consoles  alter column org_id set not null, alter column venue_id set not null;
alter table public.sessions  alter column org_id set not null, alter column venue_id set not null;
alter table public.shifts    alter column org_id set not null, alter column venue_id set not null;

create index pricing_plans_org_id_idx      on public.pricing_plans(org_id);
create index employees_org_id_idx          on public.employees(org_id);
create index session_extensions_org_id_idx on public.session_extensions(org_id);
create index consoles_org_id_idx           on public.consoles(org_id);
create index consoles_venue_id_idx         on public.consoles(venue_id);
create index sessions_org_id_idx           on public.sessions(org_id);
create index sessions_venue_id_idx         on public.sessions(venue_id);
create index shifts_org_id_idx             on public.shifts(org_id);
create index shifts_venue_id_idx           on public.shifts(venue_id);

-- ---------------------------------------------------------------------------
-- 6. RLS on tenant tables
-- ---------------------------------------------------------------------------

alter table public.organizations   enable row level security;
alter table public.venues          enable row level security;
alter table public.org_members     enable row level security;
alter table public.platform_admins enable row level security;

create policy "org_read" on public.organizations for select to authenticated
  using (is_org_member(id) or is_platform_admin());
create policy "org_update" on public.organizations for update to authenticated
  using (is_org_admin(id) or is_platform_admin())
  with check (is_org_admin(id) or is_platform_admin());

create policy "venue_read" on public.venues for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "venue_write" on public.venues for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

create policy "member_read" on public.org_members for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "member_manage" on public.org_members for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

create policy "platform_read" on public.platform_admins for select to authenticated
  using (is_platform_admin());

revoke all on public.organizations   from anon;
revoke all on public.venues          from anon;
revoke all on public.org_members     from anon;
revoke all on public.platform_admins from anon;

-- ---------------------------------------------------------------------------
-- 7. Replace permissive policies with org-scoped ones
-- ---------------------------------------------------------------------------

drop policy "auth_all"    on public.pricing_plans;
drop policy "auth_all"    on public.consoles;
drop policy "auth_all"    on public.sessions;
drop policy "auth_all"    on public.session_extensions;
drop policy "auth_all"    on public.shifts;
drop policy "auth_read"   on public.employees;
drop policy "auth_write"  on public.employees;
drop policy "auth_update" on public.employees;

create policy "org_scope" on public.pricing_plans for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.consoles for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.sessions for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.session_extensions for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.shifts for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.employees for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- 8. Tenant-aware RPCs
-- ---------------------------------------------------------------------------

-- start_session now derives org_id/venue_id from the console (RLS protects it).
create or replace function public.start_session(
  p_console_id   int,
  p_plan_id      int,
  p_duration_min int,
  p_customer_name text default null,
  p_created_by   int default null
)
returns public.sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_price   numeric(10,2);
  v_org     uuid;
  v_venue   uuid;
  v_session public.sessions;
begin
  select org_id, venue_id into v_org, v_venue
    from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;

  select price_per_hour into v_price
    from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;

  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, duration_min,
    ends_at, price_per_hour, price_total, created_by
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, p_duration_min,
    now() + make_interval(mins => p_duration_min),
    v_price, round((p_duration_min / 60.0) * v_price, 2), p_created_by
  )
  returning * into v_session;

  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end;
$$;

-- extend_session stamps org_id on the extension (derived from the session).
create or replace function public.extend_session(p_session_id uuid, p_extra_min int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pph numeric(10,2);
  v_org uuid;
begin
  select price_per_hour, org_id into v_pph, v_org
    from public.sessions where id = p_session_id;
  if v_pph is null then raise exception 'სესია ვერ მოიძებნა'; end if;

  insert into public.session_extensions (org_id, session_id, extra_minutes, extra_price)
    values (v_org, p_session_id, p_extra_min, round((p_extra_min / 60.0) * v_pph, 2));

  update public.sessions
     set ends_at = ends_at + make_interval(mins => p_extra_min)
   where id = p_session_id;
end;
$$;

-- clock_toggle now takes the current venue; PIN is matched inside that org only.
drop function if exists public.clock_toggle(text);
create or replace function public.clock_toggle(p_pin text, p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org   uuid;
  v_emp   public.employees%rowtype;
  v_shift public.shifts%rowtype;
  v_hours numeric(5,2);
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not public.is_org_member(v_org) then
    return jsonb_build_object('ok', false, 'message', 'წვდომა აკრძალულია');
  end if;

  select * into v_emp from public.employees
   where is_active and org_id = v_org and pin_hash = crypt(p_pin, pin_hash)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'PIN არასწორია');
  end if;

  select * into v_shift from public.shifts
   where employee_id = v_emp.id and clock_out is null
   order by clock_in desc limit 1;

  if found then
    update public.shifts set clock_out = now()
     where id = v_shift.id
     returning hours_worked into v_hours;
    return jsonb_build_object('ok', true, 'action', 'out',
      'employee', v_emp.name, 'hours_worked', v_hours);
  else
    insert into public.shifts (org_id, venue_id, employee_id)
      values (v_org, p_venue_id, v_emp.id);
    return jsonb_build_object('ok', true, 'action', 'in', 'employee', v_emp.name);
  end if;
end;
$$;

revoke all on function public.clock_toggle(text, uuid) from public, anon;
grant execute on function public.clock_toggle(text, uuid) to authenticated;

-- set_employee_pin now guarded: only org admins of that employee may set it.
create or replace function public.set_employee_pin(p_employee_id int, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.employees where id = p_employee_id;
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'წვდომა აკრძალულია';
  end if;
  update public.employees
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_employee_id;
end;
$$;

-- create_organization: self-serve onboarding (org + venue + owner + default plans).
create or replace function public.create_organization(p_org_name text, p_venue_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'ავტორიზაცია საჭიროა'; end if;
  if coalesce(trim(p_org_name), '') = '' then raise exception 'ორგანიზაციის სახელი სავალდებულოა'; end if;

  insert into public.organizations (name) values (trim(p_org_name)) returning id into v_org;
  insert into public.venues (org_id, name)
    values (v_org, coalesce(nullif(trim(p_venue_name), ''), 'მთავარი ფილიალი'));
  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour) values
    (v_org, 'სტანდარტი', 'standard', 2, 5.00),
    (v_org, 'პრემიუმი',  'premium',  4, 8.00);
  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
