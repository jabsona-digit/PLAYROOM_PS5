-- 0093 - backfill: capture the LIVE marketplace booking RPCs (fix schema drift).
--
-- During the booking-flow iteration (martelounge-web), create_marketplace_booking was
-- extended in prod (added p_console_type + a specific-unit p_console_id) and a new
-- get_venue_consoles was added, but NO migration captured them — 0031/0038 hold only
-- the OLD 11-arg version (no p_console_type/p_console_id). A migration replay would
-- therefore REGRESS the public booking flow. This migration reproduces prod EXACTLY
-- (defs dumped via pg_get_functiondef on 2026-06-19). Applying it to current prod is a
-- no-op (create-or-replace with identical bodies); on a fresh replay it produces the
-- correct final state. See [[accounting-schema-drift]] / [[migration-apply-method]].

-- Drop the stale 11-arg signature (0031/0038) so a replay doesn't leave an overload.
drop function if exists public.create_marketplace_booking(
  text, timestamptz, integer, text, text, integer, integer, integer, integer, text, text);

-- Live 12-arg version (adds p_console_type + optional specific-unit p_console_id).
CREATE OR REPLACE FUNCTION public.create_marketplace_booking(p_slug text, p_start timestamp with time zone, p_duration_min integer, p_customer_name text, p_customer_phone text, p_console_type text DEFAULT 'standard'::text, p_pricing_plan_id integer DEFAULT NULL::integer, p_controllers integer DEFAULT 2, p_party_size integer DEFAULT NULL::integer, p_payment_method text DEFAULT 'transfer'::text, p_notes text DEFAULT NULL::text, p_console_id integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- optional: pin a SPECIFIC unit (customer preference). Must exist in this
  -- venue+type and be free for the window. Pool check above still prevents oversell.
  if p_console_id is not null then
    if not exists (
      select 1 from public.consoles
       where id = p_console_id and venue_id = v_venue and deleted_at is null
         and console_type = coalesce(p_console_type,'standard')
    ) then
      raise exception 'console_not_found';
    end if;
    if exists (
      select 1 from public.marketplace_bookings b
       where b.console_id = p_console_id and b.status in ('pending','confirmed')
         and b.start_time < v_end
         and b.start_time + make_interval(mins => b.duration_min) > p_start
    ) then
      raise exception 'console_taken';
    end if;
  end if;

  if p_pricing_plan_id is not null then
    select price_per_hour into v_pph from public.pricing_plans
      where id = p_pricing_plan_id and org_id = v_org and is_active;
  end if;
  v_total := round(coalesce(v_pph, 0) * p_duration_min / 60.0, 2);

  insert into public.marketplace_customers (id, full_name, phone)
    values (v_uid, p_customer_name, p_customer_phone)
    on conflict (id) do nothing;

  insert into public.marketplace_bookings (
    org_id, venue_id, console_id, console_type, pricing_plan_id, customer_id,
    customer_name, customer_phone, start_time, duration_min, controllers,
    party_size, payment_method, total_amount, commission_amount, notes
  ) values (
    v_org, v_venue, p_console_id, coalesce(p_console_type,'standard'), p_pricing_plan_id, v_uid,
    p_customer_name, p_customer_phone, p_start, p_duration_min, p_controllers,
    p_party_size, p_payment_method, v_total, round(v_total * 0.05, 2), p_notes
  ) returning id into v_id;

  return v_id;
end; $function$;

-- Live per-console availability (specific-unit picker + admin views). Not in any
-- prior migration at all.
CREATE OR REPLACE FUNCTION public.get_venue_consoles(p_slug text, p_date date)
 RETURNS TABLE(console_id integer, name text, console_type text, busy jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with v as (
    select id from public.venues where slug = p_slug and is_published = true and is_active = true
  ),
  cs as (
    select c.id, c.name, c.console_type
      from public.consoles c join v on c.venue_id = v.id
     where c.deleted_at is null
  )
  select cs.id, cs.name, cs.console_type,
    coalesce((
      select jsonb_agg(jsonb_build_object('start', x.s, 'end', x.e))
      from (
        select b.start_time as s, b.start_time + make_interval(mins => b.duration_min) as e
          from public.marketplace_bookings b
         where b.console_id = cs.id and b.status in ('pending','confirmed') and b.start_time::date = p_date
        union all
        select r.start_time, r.start_time + make_interval(mins => r.duration_min)
          from public.reservations r
         where r.console_id = cs.id and coalesce(r.status,'') <> 'cancelled' and r.start_time::date = p_date
        union all
        select s2.started_at, coalesce(s2.ends_at, s2.started_at + interval '6 hours')
          from public.sessions s2
         where s2.console_id = cs.id and s2.ended_at is null and s2.started_at::date = p_date
      ) x
    ), '[]'::jsonb) as busy
  from cs
  order by cs.console_type, cs.name;
$function$;

-- Grants — match prod ACL exactly (PUBLIC has no execute; anon/authenticated/service_role do).
revoke all on function public.create_marketplace_booking(text, timestamptz, integer, text, text, text, integer, integer, integer, text, text, integer) from public;
grant execute on function public.create_marketplace_booking(text, timestamptz, integer, text, text, text, integer, integer, integer, text, text, integer) to anon, authenticated, service_role;
revoke all on function public.get_venue_consoles(text, date) from public;
grant execute on function public.get_venue_consoles(text, date) to anon, authenticated, service_role;
