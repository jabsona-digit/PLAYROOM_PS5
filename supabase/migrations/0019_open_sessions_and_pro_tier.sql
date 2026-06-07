-- 0019: open (running) sessions + Pro (3-controller) tier + self-serve plan types.

-- 1. Allow more plan tiers: Pro (3 controllers) plus user-added custom plans.
alter table public.pricing_plans drop constraint if exists pricing_plans_type_check;
alter table public.pricing_plans
  add constraint pricing_plans_type_check
  check (type in ('standard', 'pro', 'premium', 'custom'));

-- 2. Open sessions have no fixed end / duration until they're closed.
alter table public.sessions alter column ends_at      drop not null;
alter table public.sessions alter column duration_min drop not null;
alter table public.sessions add column if not exists is_open boolean not null default false;

-- 3. Start an OPEN (pay-as-you-go) session: no end time; price settled at close.
create or replace function public.start_open_session(
  p_console_id     int,
  p_plan_id        int,
  p_customer_name  text default null,
  p_created_by     int default null,
  p_payment_method text default 'cash',
  p_bank           text default null
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
  v_bank    text := p_bank;
  v_session public.sessions;
begin
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'გადახდის მეთოდი არასწორია';
  end if;
  if p_payment_method = 'cash' then
    v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC', 'BOG') then
    raise exception 'მიუთითე ბანკი (TBC ან BOG)';
  end if;

  select org_id, venue_id into v_org, v_venue
    from public.consoles where id = p_console_id;
  if v_org is null then raise exception 'კონსოლი ვერ მოიძებნა'; end if;

  select price_per_hour into v_price
    from public.pricing_plans where id = p_plan_id and is_active and org_id = v_org;
  if v_price is null then raise exception 'ტარიფი ვერ მოიძებნა ან გათიშულია'; end if;

  insert into public.sessions (
    org_id, venue_id, console_id, pricing_plan_id, customer_name, duration_min,
    ends_at, price_per_hour, price_total, created_by, payment_method, bank, is_open
  ) values (
    v_org, v_venue, p_console_id, p_plan_id, p_customer_name, null,
    null, v_price, 0, p_created_by, p_payment_method, v_bank, true
  )
  returning * into v_session;

  update public.consoles set status = 'active' where id = p_console_id;
  return v_session;
end;
$$;

revoke all on function public.start_open_session(int, int, text, int, text, text) from public, anon;
grant execute on function public.start_open_session(int, int, text, int, text, text) to authenticated;

-- 4. end_session: for OPEN sessions compute the final price from elapsed time,
--    rounding UP to the nearest 5 minutes (minimum 5). Fixed sessions unchanged.
create or replace function public.end_session(p_session_id uuid, p_tip numeric default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_is_open  boolean;
  v_started  timestamptz;
  v_pph      numeric(10,2);
  v_minutes  int;
begin
  select org_id, is_open, started_at, price_per_hour
    into v_org_id, v_is_open, v_started, v_pph
  from public.sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;
  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  if v_is_open then
    v_minutes := greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5);
    update public.sessions
    set status       = 'completed',
        ended_at     = now(),
        ends_at      = now(),
        duration_min = v_minutes,
        price_total  = round((v_minutes / 60.0) * v_pph, 2),
        tip_amount   = coalesce(p_tip, 0)
    where id = p_session_id and status = 'active';
  else
    update public.sessions
    set status     = 'completed',
        ended_at   = now(),
        tip_amount = coalesce(p_tip, 0)
    where id = p_session_id and status = 'active';
  end if;

  if not found then raise exception 'not_active'; end if;

  update public.consoles set status = 'free'
  where id = (select console_id from public.sessions where id = p_session_id);
end;
$$;

-- 5. Backfill a Pro (3-controller, ₾7/hr) plan for every org that lacks one.
insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour)
select o.id, 'Pro', 'pro', 3, 7.00
from public.organizations o
where not exists (
  select 1 from public.pricing_plans p
  where p.org_id = o.id and p.controllers = 3
);

-- 6. New orgs are seeded with all three tiers.
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
    (v_org, 'Pro',        'pro',      3, 7.00),
    (v_org, 'პრემიუმი',  'premium',  4, 8.00);
  return v_org;
end;
$$;
