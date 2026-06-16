-- 0071 Multi-venue-type support (billiard first; karaoke/vr/mixed future).
--
-- Strategy: Martelounge → "Entertainment Venue OS". The heavy lifting already
-- shipped — `consoles.console_type` is FREE-TEXT typed capacity pools (0039), so a
-- billiard room creates tables as console_type='ბილიარდი'/'სნუკერი' TODAY with no
-- schema change, and tournaments (generic) / equipment (bar_products) already work.
--
-- So this migration is small + additive only:
--   • venues.venue_type   — the venue's primary segment (drives UI labels + the
--                           public /live + marketplace category filter).
--   • venues.venue_config — informational jsonb (cues, ball sets, …).
--   • consoles.asset_label — owner's custom display name ("მაგიდა #3").
--   • console_hardware.target += 'light' — billiard control lever is the table
--                           lamp (safe to hard-switch; no SSD caveat like PS5/TV).
--   • public_venues        — expose venue_type (column appended at END, every
--                           existing column preserved verbatim; org_id still hidden).
--   • get_pulse_stats      — per-venue venue_type so /live can group by category.
--
-- NOTE on the earlier brief: it targeted "0067" (taken — dynamic_pricing) and
-- assumed a per-console get_venue_availability + a console_type CHECK that does not
-- exist. Both were stale. We do NOT touch get_venue_availability (capacity model is
-- correct) and we do NOT add a console_type CHECK (free-text by design).

-- ── 1. venues.venue_type ─────────────────────────────────────────────────────
alter table public.venues
  add column if not exists venue_type text not null default 'playroom'
    check (venue_type in ('playroom', 'billiard', 'karaoke', 'vr', 'mixed'));

comment on column public.venues.venue_type is
  'Primary venue segment: playroom (PS5/Xbox/PC), billiard, karaoke, vr, or mixed (multiple). Drives UI labels + public category filter.';

-- ── 2. venues.venue_config (informational) ───────────────────────────────────
alter table public.venues
  add column if not exists venue_config jsonb not null default '{}'::jsonb;

comment on column public.venues.venue_config is
  'Informational per-venue config (e.g. billiard: cues_available, ball_sets). No RPC logic depends on it.';

-- ── 3. consoles.asset_label (custom display name) ────────────────────────────
alter table public.consoles
  add column if not exists asset_label text;

comment on column public.consoles.asset_label is
  'Owner custom display name for the asset ("მაგიდა #3"). Frontend renders: asset_label ?? name.';

-- ── 4. console_hardware.target += 'light' (billiard lamp) ────────────────────
-- A billiard table is unusable in the dark, the overhead lamp is safe to switch
-- with zero data-loss risk, so it IS the control lever — cut directly (no "cut TV
-- not console" SSD caveat). Same pipeline as PS5: relay ON at session start, OFF
-- at end; ghost detection + hardware_required gate apply unchanged.
alter table public.console_hardware
  drop constraint if exists console_hardware_target_check;
alter table public.console_hardware
  add constraint console_hardware_target_check
    check (target in ('tv', 'console', 'hdmi', 'network', 'light'));

-- ── 5. public_venues — expose venue_type (append at END, keep all columns) ────
-- create or replace requires the same leading columns in the same order; we only
-- ADD venue_type at the tail. price_from stays org-scoped; org_id stays hidden.
create or replace view public.public_venues as
  select
    v.id,
    v.slug,
    v.name,
    v.description,
    v.address,
    v.city,
    v.public_phone,
    v.cover_image_url,
    v.gallery,
    v.amenities,
    v.opening_hours,
    v.lat,
    v.lng,
    v.avg_rating,
    v.review_count,
    (select min(pp.price_per_hour)
       from public.pricing_plans pp
      where pp.org_id = v.org_id and pp.is_active) as price_from,
    v.venue_type
  from public.venues v
  where v.is_published = true and v.is_active = true;

grant select on public.public_venues to anon, authenticated;

-- ── 6. get_pulse_stats — per-venue venue_type for /live category grouping ─────
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
  -- per-venue occupancy + the venue list for the map
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
  merged as (
    select p.id, p.name, p.city, p.lat, p.lng, p.venue_type,
           coalesce(cn.total, 0) as total,
           coalesce(cn.busy, 0)  as busy
    from pub p left join cons cn on cn.venue_id = p.id
  )
  select
    coalesce(sum(busy), 0)::int,
    count(*)::int,
    count(*) filter (where busy > 0)::int,
    coalesce(jsonb_agg(jsonb_build_object(
       'name', name, 'city', city, 'lat', lat, 'lng', lng, 'total', total, 'busy', busy,
       'venue_type', venue_type,
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
