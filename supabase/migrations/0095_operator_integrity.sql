-- 0095 - Operator integrity (anti-fraud, ZERO hardware).
--
-- Detects joystick under-ringing statistically: per operator, the AVG joysticks they
-- ring on playroom sessions vs the venue average. An operator who consistently rings
-- FEWER joysticks than peers (deviation > 0) with enough sessions is flagged. Bar
-- spend on their "2-joystick" sessions is a corroborating signal (a real 2-player
-- group spends less at the bar than an under-rung 4-player group).
--
-- Attribution = created_by_user (logged-in staff). Playroom-only (joysticks are a
-- playroom concept; billiard excluded via pricing_plans.category). Names via
-- employees.user_id / auth email. Threshold is tunable (cnt>=5, dev>=0.3).

create or replace function public.get_operator_integrity(
  p_org_id   uuid,
  p_from     timestamptz default (now() - interval '30 days'),
  p_to       timestamptz default now(),
  p_venue_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_org_member(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  return (
    with ps as (
      select s.id,
             s.created_by_user as uid,
             pp.controllers     as j,
             coalesce((
               select sum(b.total) from public.bar_sales b
               where b.session_id = s.id and b.voided_at is null
             ), 0) as bar
      from public.sessions s
      join public.pricing_plans pp on pp.id = s.pricing_plan_id
      where s.org_id = p_org_id
        and s.created_by_user is not null
        and coalesce(pp.category, 'playroom') = 'playroom'
        and pp.controllers is not null
        and s.started_at >= p_from and s.started_at < p_to
        and (p_venue_id is null or s.venue_id = p_venue_id)
    ),
    venue as (
      select round(avg(j), 2) as avg_j,
             round(100.0 * avg((j <= 2)::int), 0) as pct2,
             count(*) as n
      from ps
    ),
    ops as (
      select uid,
             count(*) as cnt,
             round(avg(j), 2) as avgj,
             round(100.0 * avg((j <= 2)::int), 0) as pct2,
             round(avg(bar) filter (where j <= 2), 2) as bar2
      from ps group by uid
    )
    select jsonb_build_object(
      'venue_avg_joysticks', (select avg_j from venue),
      'venue_pct_2j',        (select pct2  from venue),
      'venue_sessions',      (select n     from venue),
      'operators', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name',          coalesce(e.name, split_part(au.email, '@', 1)),
          'role',          e.role,
          'sessions',      o.cnt,
          'avg_joysticks', o.avgj,
          'pct_2j',        o.pct2,
          'bar_on_2j_avg', coalesce(o.bar2, 0),
          'deviation',     round((select avg_j from venue) - o.avgj, 2),
          'flag',          (o.cnt >= 5 and o.avgj <= (select avg_j from venue) - 0.3)
        ) order by ((select avg_j from venue) - o.avgj) desc)
        from ops o
        left join public.employees e on e.user_id = o.uid and e.org_id = p_org_id
        left join auth.users au on au.id = o.uid
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_operator_integrity(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_operator_integrity(uuid, timestamptz, timestamptz, uuid) to authenticated;
