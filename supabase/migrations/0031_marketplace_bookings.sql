-- 0031 Marketplace bookings
-- Customer-facing bookings with live-availability lookup and double-booking
-- protection. Payments are architected in (status/method/deposit/commission)
-- but TBC/BOG Pay wiring lands later — until then staff "mark as paid".
--
-- Schema-compat: console_id / pricing_plan_id are INTEGER (not uuid);
-- no enums (text + CHECK). Additive only.

create table if not exists public.marketplace_bookings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  venue_id        uuid not null references public.venues(id),
  console_id      integer references public.consoles(id),          -- optional: pick a specific console
  pricing_plan_id integer references public.pricing_plans(id),     -- optional tier
  customer_id     uuid references public.marketplace_customers(id) on delete set null,
  customer_name   text not null,
  customer_phone  text not null,
  start_time      timestamptz not null,
  duration_min    integer not null check (duration_min between 30 and 1440),
  controllers     integer not null default 2,
  party_size      integer,
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','cancelled','completed','no_show')),
  payment_method  text not null default 'transfer'
                    check (payment_method in ('transfer','card','cash_on_arrival')),
  payment_status  text not null default 'unpaid'
                    check (payment_status in ('unpaid','deposit_paid','paid','refunded')),
  total_amount      numeric(10,2) not null default 0,
  deposit_amount    numeric(10,2) not null default 0,
  commission_amount numeric(10,2) not null default 0,   -- 5% platform commission
  paid_at         timestamptz,
  payment_ref     text,                                  -- TBC/BOG order id (later)
  reservation_id  uuid references public.reservations(id),  -- link to internal reservation when confirmed
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mb_venue_start_idx   on public.marketplace_bookings (venue_id, start_time);
create index if not exists mb_console_start_idx  on public.marketplace_bookings (console_id, start_time);
create index if not exists mb_customer_idx       on public.marketplace_bookings (customer_id);
create index if not exists mb_org_status_idx     on public.marketplace_bookings (org_id, status);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_mb_updated_at on public.marketplace_bookings;
create trigger trg_mb_updated_at before update on public.marketplace_bookings
  for each row execute function public.set_updated_at();

alter table public.marketplace_bookings enable row level security;

-- Customer: read only their own bookings (insert happens via the RPC below).
drop policy if exists mb_select_own on public.marketplace_bookings;
create policy mb_select_own on public.marketplace_bookings
  for select using (auth.uid() = customer_id);

-- Staff: full read + manage (confirm / mark paid / cancel) within their org.
drop policy if exists mb_staff_select on public.marketplace_bookings;
create policy mb_staff_select on public.marketplace_bookings
  for select using (public.is_org_member(org_id));

drop policy if exists mb_staff_update on public.marketplace_bookings;
create policy mb_staff_update on public.marketplace_bookings
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ── Availability: per-console busy intervals for a date (anon-callable) ──────
-- Combines marketplace bookings + internal staff reservations. Exposes only
-- console id/name and {start,end} ranges — no other internal data leaks.
create or replace function public.get_venue_availability(p_slug text, p_date date)
returns table(console_id integer, console_name text, slot_number integer, busy jsonb)
language sql stable security definer set search_path = public as $$
  with v as (
    select id from public.venues
     where slug = p_slug and is_published = true and is_active = true
  )
  select c.id, c.name, c.slot_number,
    coalesce(
      jsonb_agg(jsonb_build_object('start', b.s, 'end', b.e) order by b.s)
        filter (where b.s is not null),
      '[]'::jsonb)
  from v
  join public.consoles c on c.venue_id = v.id and c.deleted_at is null
  left join lateral (
    select start_time as s, start_time + make_interval(mins => duration_min) as e
      from public.marketplace_bookings
     where console_id = c.id
       and status in ('pending','confirmed')
       and start_time::date = p_date
    union all
    select start_time, start_time + make_interval(mins => duration_min)
      from public.reservations
     where console_id = c.id
       and coalesce(status, '') <> 'cancelled'
       and start_time::date = p_date
  ) b on true
  group by c.id, c.name, c.slot_number
  order by c.slot_number;
$$;

grant execute on function public.get_venue_availability(text, date) to anon, authenticated;

-- ── Create booking RPC (authenticated customer; conflict-safe) ──────────────
create or replace function public.create_marketplace_booking(
  p_slug            text,
  p_start           timestamptz,
  p_duration_min    integer,
  p_customer_name   text,
  p_customer_phone  text,
  p_console_id      integer default null,
  p_pricing_plan_id integer default null,
  p_controllers     integer default 2,
  p_party_size      integer default null,
  p_payment_method  text    default 'transfer',
  p_notes           text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_venue   uuid;
  v_end     timestamptz := p_start + make_interval(mins => p_duration_min);
  v_pph     numeric := 0;
  v_total   numeric := 0;
  v_id      uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  if p_start <= now() then raise exception 'start_in_past'; end if;
  if p_duration_min < 30 or p_duration_min > 1440 then raise exception 'invalid_duration'; end if;
  if p_payment_method not in ('transfer','card','cash_on_arrival') then
    raise exception 'invalid_payment_method';
  end if;

  select v.id, v.org_id into v_venue, v_org
    from public.venues v
   where v.slug = p_slug and v.is_published = true and v.is_active = true;
  if v_venue is null then raise exception 'venue_not_found'; end if;

  if p_console_id is not null then
    perform 1 from public.consoles
      where id = p_console_id and venue_id = v_venue and deleted_at is null;
    if not found then raise exception 'console_not_found'; end if;

    -- serialize concurrent bookings for the same console
    perform pg_advisory_xact_lock(hashtextextended(p_console_id::text, 0));

    if exists (
      select 1 from public.marketplace_bookings
       where console_id = p_console_id
         and status in ('pending','confirmed')
         and start_time < v_end
         and start_time + make_interval(mins => duration_min) > p_start
    ) or exists (
      select 1 from public.reservations
       where console_id = p_console_id
         and coalesce(status, '') <> 'cancelled'
         and start_time < v_end
         and start_time + make_interval(mins => duration_min) > p_start
    ) then
      raise exception 'booking_conflict';
    end if;
  end if;

  if p_pricing_plan_id is not null then
    select price_per_hour into v_pph from public.pricing_plans
      where id = p_pricing_plan_id and org_id = v_org and is_active;
  end if;
  v_total := round(coalesce(v_pph, 0) * p_duration_min / 60.0, 2);

  -- ensure the customer profile exists (registration should have created it)
  insert into public.marketplace_customers (id, full_name, phone)
    values (v_uid, p_customer_name, p_customer_phone)
    on conflict (id) do nothing;

  insert into public.marketplace_bookings (
    org_id, venue_id, console_id, pricing_plan_id, customer_id,
    customer_name, customer_phone, start_time, duration_min, controllers,
    party_size, payment_method, total_amount, commission_amount, notes
  ) values (
    v_org, v_venue, p_console_id, p_pricing_plan_id, v_uid,
    p_customer_name, p_customer_phone, p_start, p_duration_min, p_controllers,
    p_party_size, p_payment_method, v_total, round(v_total * 0.05, 2), p_notes
  ) returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.create_marketplace_booking(
  text, timestamptz, integer, text, text, integer, integer, integer, integer, text, text
) to authenticated;
