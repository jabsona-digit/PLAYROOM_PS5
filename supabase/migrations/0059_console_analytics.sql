-- 0059 Console intelligence — RevPACH analytics (#7)
-- Hospitality-grade revenue science for lounges: per-console occupancy + RevPACH
-- (Revenue Per Available Console Hour = revenue / (consoles × operating hours)),
-- a venue total, and a 7×24 demand heatmap (Georgian local time) to surface dead
-- zones vs gold hours. Pure SQL over the existing `sessions` table — no new tables.
--
-- Revenue convention matches the rest of the app: status='completed' AND
-- refunded_at IS NULL (abandoned sessions are status='abandoned' w/ price_total=0,
-- so excluded automatically — see 0055). price_total already includes extensions.

create or replace function public.get_console_analytics(
  p_venue_id    uuid,
  p_from        timestamptz,
  p_to          timestamptz,
  p_daily_hours numeric default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org           uuid;
  v_days          numeric;
  v_console_count int;
  v_per_avail     numeric;   -- available hours per single console over the period
  v_avail_total   numeric;   -- across all consoles
  v_total_rev     numeric;
  v_total_min     numeric;
  v_consoles      jsonb;
  v_heatmap       jsonb;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  p_daily_hours := greatest(1, least(24, coalesce(p_daily_hours, 12)));
  -- count calendar days by Georgian wall-clock so the denominator is correct
  -- regardless of the UTC offset of the passed instants.
  v_days := greatest(1, ((p_to   at time zone 'Asia/Tbilisi')::date
                       - (p_from at time zone 'Asia/Tbilisi')::date) + 1);

  select count(*) into v_console_count
    from public.consoles where venue_id = p_venue_id and deleted_at is null;

  v_per_avail   := v_days * p_daily_hours;
  v_avail_total := greatest(1, v_console_count) * v_per_avail;

  -- per-console matrix
  with sess as (
    select s.console_id,
           coalesce(s.duration_min, 0) as mins,
           s.price_total               as rev
    from public.sessions s
    where s.venue_id = p_venue_id
      and s.status = 'completed'
      and s.refunded_at is null
      and s.ended_at >= p_from and s.ended_at < p_to
  ),
  per as (
    select c.id, c.name,
           coalesce(count(x.console_id), 0) as sessions,
           coalesce(sum(x.mins), 0)         as occ_min,
           coalesce(sum(x.rev), 0)          as revenue
    from public.consoles c
    left join sess x on x.console_id = c.id
    where c.venue_id = p_venue_id and c.deleted_at is null
    group by c.id, c.name
  )
  select jsonb_agg(jsonb_build_object(
           'console_id',    id,
           'name',          name,
           'sessions',      sessions,
           'occupied_min',  occ_min,
           'revenue',       revenue,
           'occupancy_pct', round(least(100, (occ_min / 60.0) / v_per_avail * 100), 1),
           'revpach',       round(revenue / v_per_avail, 2)
         ) order by revenue desc)
    into v_consoles from per;

  -- 7×24 demand heatmap, bucketed by session START in Georgian local time
  select coalesce(jsonb_agg(jsonb_build_object(
           'dow', dow, 'hour', hr, 'sessions', cnt, 'revenue', rev)), '[]'::jsonb)
    into v_heatmap
  from (
    select extract(dow  from s.started_at at time zone 'Asia/Tbilisi')::int as dow,
           extract(hour from s.started_at at time zone 'Asia/Tbilisi')::int as hr,
           count(*)          as cnt,
           sum(s.price_total) as rev
    from public.sessions s
    where s.venue_id = p_venue_id
      and s.status = 'completed' and s.refunded_at is null
      and s.started_at >= p_from and s.started_at < p_to
    group by 1, 2
  ) h;

  select coalesce(sum(price_total), 0), coalesce(sum(coalesce(duration_min, 0)), 0)
    into v_total_rev, v_total_min
  from public.sessions
  where venue_id = p_venue_id and status = 'completed' and refunded_at is null
    and ended_at >= p_from and ended_at < p_to;

  return jsonb_build_object(
    'console_count',           v_console_count,
    'days',                    v_days,
    'daily_hours',             p_daily_hours,
    'available_console_hours', round(v_avail_total, 1),
    'total_revenue',           v_total_rev,
    'total_occupied_hours',    round(v_total_min / 60.0, 1),
    'occupancy_pct',           round(least(100, (v_total_min / 60.0) / v_avail_total * 100), 1),
    'revpach',                 round(v_total_rev / v_avail_total, 2),
    'consoles',                coalesce(v_consoles, '[]'::jsonb),
    'heatmap',                 v_heatmap
  );
end;
$$;

revoke all on function public.get_console_analytics(uuid, timestamptz, timestamptz, numeric) from public, anon;
grant execute on function public.get_console_analytics(uuid, timestamptz, timestamptz, numeric) to authenticated;
