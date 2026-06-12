-- 0038 Capacity-based marketplace booking (#H1 production-hardening)
-- Consoles are fungible: customers book a TIME + tier, not a specific console.
-- Availability = (# venue consoles) − concurrent usage, where usage now counts
-- live walk-in `sessions` too (closing the online↔walk-in collision Gemini found).
-- The physical console is assigned at check-in.

-- ── availability now returns venue CAPACITY + all occupying intervals ─────────
-- (bookings + reservations + ongoing sessions). The client computes free-per-hour
-- in JS against the customer's local hours (tz-correct, like before).
drop function if exists public.get_venue_availability(text, date);
create function public.get_venue_availability(p_slug text, p_date date)
returns table(capacity int, busy jsonb)
language sql stable security definer set search_path = public as $$
  with v as (
    select id from public.venues where slug = p_slug and is_published = true and is_active = true
  ),
  cap as (
    select count(*)::int c from public.consoles c join v on c.venue_id = v.id
     where c.deleted_at is null
  ),
  items as (
    select b.start_time as s, b.start_time + make_interval(mins => b.duration_min) as e
      from public.marketplace_bookings b join v on b.venue_id = v.id
     where b.status in ('pending','confirmed') and b.start_time::date = p_date
    union all
    select r.start_time, r.start_time + make_interval(mins => r.duration_min)
      from public.reservations r join v on r.venue_id = v.id
     where coalesce(r.status,'') <> 'cancelled' and r.start_time::date = p_date
    union all
    select s.started_at, coalesce(s.ends_at, s.started_at + interval '6 hours')
      from public.sessions s join v on s.venue_id = v.id
     where s.ended_at is null and s.started_at::date = p_date
  )
  select (select c from cap) as capacity,
    coalesce((select jsonb_agg(jsonb_build_object('start', s, 'end', e)) from items), '[]'::jsonb) as busy;
$$;

grant execute on function public.get_venue_availability(text, date) to anon, authenticated;

-- ── capacity-aware booking (same signature; console_id now optional, assigned later) ──
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
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_venue uuid;
  v_end   timestamptz := p_start + make_interval(mins => p_duration_min);
  v_cap   int := 0;
  v_max   int := 0;
  v_pph   numeric := 0;
  v_total numeric := 0;
  v_id    uuid;
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

  -- serialize concurrent capacity checks for this venue
  perform pg_advisory_xact_lock(hashtextextended(v_venue::text, 0));

  select count(*) into v_cap from public.consoles
    where venue_id = v_venue and deleted_at is null;
  if v_cap = 0 then raise exception 'no_capacity'; end if;

  -- peak concurrent usage across the booked hours must leave room for one more
  select coalesce(max(occ), 0) into v_max from (
    select gs, (
      (select count(*) from public.marketplace_bookings b
         where b.venue_id = v_venue and b.status in ('pending','confirmed')
           and b.start_time < gs + interval '1 hour'
           and b.start_time + make_interval(mins => b.duration_min) > gs)
      + (select count(*) from public.reservations r
         where r.venue_id = v_venue and coalesce(r.status,'') <> 'cancelled'
           and r.start_time < gs + interval '1 hour'
           and r.start_time + make_interval(mins => r.duration_min) > gs)
      + (select count(*) from public.sessions s
         where s.venue_id = v_venue and s.ended_at is null
           and s.started_at < gs + interval '1 hour'
           and coalesce(s.ends_at, s.started_at + interval '6 hours') > gs)
    ) as occ
    from generate_series(p_start, v_end - interval '1 second', interval '1 hour') gs
  ) t;
  if v_max >= v_cap then raise exception 'no_capacity'; end if;

  if p_pricing_plan_id is not null then
    select price_per_hour into v_pph from public.pricing_plans
      where id = p_pricing_plan_id and org_id = v_org and is_active;
  end if;
  v_total := round(coalesce(v_pph, 0) * p_duration_min / 60.0, 2);

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
