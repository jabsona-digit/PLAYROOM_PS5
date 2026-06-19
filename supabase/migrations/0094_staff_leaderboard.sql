-- 0094 - Staff gamification leaderboard.
--
-- Ranks staff over a window from EXISTING data (no new tables). Attribution is by
-- created_by_user (the logged-in staff member — team-invite logins) on sessions /
-- bar_sales, and by resolved_by on service_requests. Names resolve via
-- employees.user_id, else the auth email. NB: venues that share one login + PIN gate
-- won't differentiate until the acting operator is captured per action (future).

create or replace function public.get_staff_leaderboard(
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
declare v_rows jsonb;
begin
  if not (public.is_org_member(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  with sess as (
    select created_by_user as uid, count(*) n, coalesce(sum(price_total), 0) rev
    from public.sessions
    where org_id = p_org_id and created_by_user is not null
      and started_at >= p_from and started_at < p_to
      and (p_venue_id is null or venue_id = p_venue_id)
    group by created_by_user
  ),
  bar as (
    select created_by_user as uid, count(*) n, coalesce(sum(total), 0) rev
    from public.bar_sales
    where org_id = p_org_id and created_by_user is not null
      and created_at >= p_from and created_at < p_to
      and (p_venue_id is null or venue_id = p_venue_id)
      and voided_at is null
    group by created_by_user
  ),
  svc as (
    select resolved_by as uid,
           count(*) filter (where status in ('done','delivered','settled')) done,
           count(*) filter (where status = 'dismissed') dismissed
    from public.service_requests
    where org_id = p_org_id and resolved_by is not null
      and resolved_at >= p_from and resolved_at < p_to
      and (p_venue_id is null or venue_id = p_venue_id)
    group by resolved_by
  ),
  uids as (
    select uid from sess union select uid from bar union select uid from svc
  ),
  agg as (
    select u.uid,
      coalesce(s.n, 0) sess_n, coalesce(s.rev, 0) sess_rev,
      coalesce(b.n, 0) bar_n,  coalesce(b.rev, 0) bar_rev,
      coalesce(v.done, 0) svc_done, coalesce(v.dismissed, 0) svc_dismissed
    from uids u
    left join sess s on s.uid = u.uid
    left join bar  b on b.uid = u.uid
    left join svc  v on v.uid = u.uid
  )
  select jsonb_agg(row order by row->>'score' is null, (row->>'score')::int desc)
    from (
      select jsonb_build_object(
        'name', coalesce(e.name, split_part(au.email, '@', 1)),
        'role', e.role,
        'sessions', a.sess_n, 'session_revenue', round(a.sess_rev, 2),
        'bar_sales', a.bar_n, 'bar_revenue', round(a.bar_rev, 2),
        'service_done', a.svc_done, 'service_dismissed', a.svc_dismissed,
        'score', a.sess_n * 10 + a.bar_n * 15 + a.svc_done * 10 - a.svc_dismissed * 10
      ) as row
      from agg a
      left join public.employees e on e.user_id = a.uid and e.org_id = p_org_id
      left join auth.users au on au.id = a.uid
    ) t
  into v_rows;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

revoke all on function public.get_staff_leaderboard(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.get_staff_leaderboard(uuid, timestamptz, timestamptz, uuid) to authenticated;
