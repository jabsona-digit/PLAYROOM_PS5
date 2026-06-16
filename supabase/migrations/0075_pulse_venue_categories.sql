-- 0075 Pulse — precise per-venue activity categories for /live tabs.
--
-- Until now /live grouped by the single venues.venue_type, and a 'mixed' venue
-- appeared in EVERY category tab. Now get_pulse_stats also returns each venue's
-- actual categories, derived from the console_type pools it really has
-- (billiard/snooker → billiard, everything else → playroom — mirrors the
-- frontend consoleCategory). So a mixed venue shows ONLY in the tabs it truly
-- offers. venue_type stays for the card badge.

create or replace function public.get_pulse_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month         timestamptz := (date_trunc('month', (now() at time zone 'Asia/Tbilisi'))) at time zone 'Asia/Tbilisi';
  v_players       int;
  v_venues_total  int;
  v_venues_live   int;
  v_venues        jsonb;
  v_cities        jsonb;
  v_sessions_month int;
  v_hours_month   numeric;
begin
  -- per-venue occupancy + category set + the venue list for the map
  with pub as (
    select v.id, v.name, v.city, v.lat, v.lng, v.venue_type
    from public.venues v
    join public.organizations o on o.id = v.org_id
    where coalesce(v.is_published, false) and o.subscription_status in ('active', 'trialing')
  ),
  cons as (
    select c.venue_id,
           count(*)::int as total,
           count(*) filter (where s.id is not null)::int as busy
    from public.consoles c
    left join public.sessions s on s.console_id = c.id and s.status = 'active'
    where c.deleted_at is null and c.venue_id in (select id from pub)
    group by c.venue_id
  ),
  cats as (
    select c.venue_id,
           array_agg(distinct case when c.console_type in ('billiard', 'snooker')
                                   then 'billiard' else 'playroom' end) as categories
    from public.consoles c
    where c.deleted_at is null and c.venue_id in (select id from pub)
    group by c.venue_id
  ),
  merged as (
    select p.id, p.name, p.city, p.lat, p.lng, p.venue_type,
           coalesce(cn.total, 0) as total,
           coalesce(cn.busy, 0)  as busy,
           coalesce(ct.categories, array[]::text[]) as categories
    from pub p
    left join cons cn on cn.venue_id = p.id
    left join cats ct on ct.venue_id = p.id
  )
  select
    coalesce(sum(busy), 0)::int,
    count(*)::int,
    count(*) filter (where busy > 0)::int,
    coalesce(jsonb_agg(jsonb_build_object(
       'name', name, 'city', city, 'lat', lat, 'lng', lng, 'total', total, 'busy', busy,
       'venue_type', venue_type,
       'categories', to_jsonb(categories),
       'occupancy', case when total > 0 then round(100.0 * busy / total)::int else 0 end
    ) order by busy desc, name), '[]'::jsonb)
  into v_players, v_venues_total, v_venues_live, v_venues
  from merged;

  -- per-city rollup
  with pub as (
    select v.id, v.city
    from public.venues v
    join public.organizations o on o.id = v.org_id
    where coalesce(v.is_published, false) and o.subscription_status in ('active', 'trialing')
  ),
  cons as (
    select c.venue_id,
           count(*)::int as total,
           count(*) filter (where s.id is not null)::int as busy
    from public.consoles c
    left join public.sessions s on s.console_id = c.id and s.status = 'active'
    where c.deleted_at is null and c.venue_id in (select id from pub)
    group by c.venue_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'city', city, 'players', players, 'occupancy', occ
         ) order by players desc), '[]'::jsonb)
  into v_cities
  from (
    select coalesce(p.city, '—') as city,
           coalesce(sum(cn.busy), 0)::int as players,
           case when coalesce(sum(cn.total), 0) > 0 then round(100.0 * sum(cn.busy) / sum(cn.total))::int else 0 end as occ
    from pub p left join cons cn on cn.venue_id = p.id
    group by coalesce(p.city, '—')
  ) c;

  -- this-month completed sessions + hours (published venues)
  select count(*)::int,
         coalesce(round(sum(least(24, greatest(0, extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600.0)))), 0)
    into v_sessions_month, v_hours_month
    from public.sessions s
    where s.status = 'completed' and s.started_at >= v_month
      and s.venue_id in (
        select v.id from public.venues v join public.organizations o on o.id = v.org_id
        where coalesce(v.is_published, false) and o.subscription_status in ('active', 'trialing')
      );

  return jsonb_build_object(
    'players_now',     v_players,
    'venues_live',     v_venues_live,
    'venues_total',    v_venues_total,
    'sessions_month',  v_sessions_month,
    'hours_month',     v_hours_month,
    'cities',          v_cities,
    'venues',          v_venues,
    'generated_at',    now()
  );
end;
$$;

revoke all on function public.get_pulse_stats() from public;
grant execute on function public.get_pulse_stats() to anon, authenticated;
