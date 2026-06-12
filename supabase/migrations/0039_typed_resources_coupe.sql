-- 0039 Typed resources (coupe/VIP) + walk-in capacity guard (#H1b)
-- Some resources aren't fungible (a coupe — esp. when there's only 1). Model
-- them as a console_type pool with its own capacity. A BEFORE INSERT trigger on
-- `sessions` enforces, for the console's type, that concurrent usage (live
-- sessions + un-checked-in bookings + reservations) never exceeds capacity — so
-- an operator can't start a walk-in on a coupe that's booked for that window.
-- Override = mark the booking no_show/cancelled (frees it) or check the customer
-- in (sets checked_in_at, which frees the hold for their own session).

alter table public.consoles
  add column if not exists console_type text not null default 'standard';

alter table public.marketplace_bookings
  add column if not exists console_type text not null default 'standard',
  add column if not exists checked_in_at timestamptz;

create index if not exists consoles_type_idx on public.consoles (venue_id, console_type) where deleted_at is null;

-- ── capacity guard: a session may start only if its console TYPE has room ─────
create or replace function public.enforce_console_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type  text;
  v_venue uuid := new.venue_id;
  v_cap   int;
  v_used  int;
  v_end   timestamptz := coalesce(new.ends_at, new.started_at + interval '6 hours');
begin
  select console_type into v_type from public.consoles where id = new.console_id;
  if v_type is null then return new; end if;

  select count(*) into v_cap from public.consoles
   where venue_id = v_venue and deleted_at is null and console_type = v_type;

  select
    (select count(*) from public.sessions s
       join public.consoles c on c.id = s.console_id
      where s.venue_id = v_venue and c.console_type = v_type and s.ended_at is null
        and s.started_at < v_end
        and coalesce(s.ends_at, s.started_at + interval '6 hours') > new.started_at)
  + (select count(*) from public.marketplace_bookings b
      where b.venue_id = v_venue and b.console_type = v_type
        and b.status in ('pending','confirmed') and b.checked_in_at is null
        and b.start_time < v_end
        and b.start_time + make_interval(mins => b.duration_min) > new.started_at)
  + (select count(*) from public.reservations r
       join public.consoles c on c.id = r.console_id
      where r.venue_id = v_venue and c.console_type = v_type
        and coalesce(r.status,'') <> 'cancelled'
        and r.start_time < v_end
        and r.start_time + make_interval(mins => r.duration_min) > new.started_at)
  into v_used;

  if v_used >= v_cap then
    raise exception 'console_reserved'
      using detail = 'ამ ტიპის ყველა ერთეული დაკავებულია (ჯავშანი). გაათავისუფლე ჯავშანი (no_show) ან გააკეთე check-in.';
  end if;

  return new;
end; $$;

drop trigger if exists trg_enforce_console_capacity on public.sessions;
create trigger trg_enforce_console_capacity
  before insert on public.sessions
  for each row execute function public.enforce_console_capacity();

-- ── availability now per console_type (capacity + occupying intervals) ────────
drop function if exists public.get_venue_availability(text, date);
create function public.get_venue_availability(p_slug text, p_date date)
returns table(console_type text, capacity int, busy jsonb)
language sql stable security definer set search_path = public as $$
  with v as (
    select id from public.venues where slug = p_slug and is_published = true and is_active = true
  ),
  types as (
    select c.console_type as t, count(*)::int as cap
      from public.consoles c join v on c.venue_id = v.id
     where c.deleted_at is null
     group by c.console_type
  ),
  items as (
    select b.console_type as t, b.start_time as s, b.start_time + make_interval(mins => b.duration_min) as e
      from public.marketplace_bookings b join v on b.venue_id = v.id
     where b.status in ('pending','confirmed') and b.checked_in_at is null and b.start_time::date = p_date
    union all
    select c.console_type, r.start_time, r.start_time + make_interval(mins => r.duration_min)
      from public.reservations r join v on r.venue_id = v.id
      join public.consoles c on c.id = r.console_id
     where coalesce(r.status,'') <> 'cancelled' and r.start_time::date = p_date
    union all
    select c.console_type, s.started_at, coalesce(s.ends_at, s.started_at + interval '6 hours')
      from public.sessions s join v on s.venue_id = v.id
      join public.consoles c on c.id = s.console_id
     where s.ended_at is null and s.started_at::date = p_date
  )
  select t.t as console_type, t.cap as capacity,
    coalesce((select jsonb_agg(jsonb_build_object('start', i.s, 'end', i.e)) from items i where i.t = t.t), '[]'::jsonb) as busy
  from types t
  order by (t.t = 'standard') desc, t.t;
$$;

grant execute on function public.get_venue_availability(text, date) to anon, authenticated;

-- ── booking is per type; capacity check uses that type's pool ────────────────
drop function if exists public.create_marketplace_booking(
  text, timestamptz, integer, text, text, integer, integer, integer, integer, text, text);

create function public.create_marketplace_booking(
  p_slug            text,
  p_start           timestamptz,
  p_duration_min    integer,
  p_customer_name   text,
  p_customer_phone  text,
  p_console_type    text    default 'standard',
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

  perform pg_advisory_xact_lock(hashtextextended(v_venue::text || ':' || coalesce(p_console_type,'standard'), 0));

  select count(*) into v_cap from public.consoles
    where venue_id = v_venue and deleted_at is null and console_type = coalesce(p_console_type,'standard');
  if v_cap = 0 then raise exception 'no_capacity'; end if;

  select coalesce(max(occ), 0) into v_max from (
    select gs, (
      (select count(*) from public.marketplace_bookings b
         where b.venue_id = v_venue and b.console_type = coalesce(p_console_type,'standard')
           and b.status in ('pending','confirmed') and b.checked_in_at is null
           and b.start_time < gs + interval '1 hour'
           and b.start_time + make_interval(mins => b.duration_min) > gs)
      + (select count(*) from public.reservations r join public.consoles c on c.id = r.console_id
         where r.venue_id = v_venue and c.console_type = coalesce(p_console_type,'standard')
           and coalesce(r.status,'') <> 'cancelled'
           and r.start_time < gs + interval '1 hour'
           and r.start_time + make_interval(mins => r.duration_min) > gs)
      + (select count(*) from public.sessions s join public.consoles c on c.id = s.console_id
         where s.venue_id = v_venue and c.console_type = coalesce(p_console_type,'standard')
           and s.ended_at is null
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
    org_id, venue_id, console_type, pricing_plan_id, customer_id,
    customer_name, customer_phone, start_time, duration_min, controllers,
    party_size, payment_method, total_amount, commission_amount, notes
  ) values (
    v_org, v_venue, coalesce(p_console_type,'standard'), p_pricing_plan_id, v_uid,
    p_customer_name, p_customer_phone, p_start, p_duration_min, p_controllers,
    p_party_size, p_payment_method, v_total, round(v_total * 0.05, 2), p_notes
  ) returning id into v_id;

  return v_id;
end; $$;

revoke execute on function public.create_marketplace_booking(
  text, timestamptz, integer, text, text, text, integer, integer, integer, text, text) from public;
grant execute on function public.create_marketplace_booking(
  text, timestamptz, integer, text, text, text, integer, integer, integer, text, text) to authenticated;
