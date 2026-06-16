-- 0079 — Extend get_org_overview (0078) with a club-wide payment split for TODAY.
--
-- The owner wants "cash vs non-cash across all venues" at the club level — how much
-- physical cash is floating across the whole club today. Adds a `payments` object
-- (cash / card / transfer) summed over sessions + bar for every venue of the org,
-- for the today window. Same signature, same auth — only the returned jsonb grows
-- (additive; the existing venues/totals keys are unchanged).

create or replace function public.get_org_overview(
  p_org_id uuid,
  p_today  timestamptz,
  p_week   timestamptz,
  p_month  timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_pay    jsonb;
begin
  if not (public.is_org_admin(p_org_id) or public.is_platform_admin()) then
    raise exception 'unauthorized';
  end if;

  with v as (
    select id, name, venue_type from public.venues where org_id = p_org_id
  ),
  sess as (
    select s.venue_id,
      sum(s.price_total) filter (where coalesce(s.ended_at, s.ends_at, s.started_at) >= p_today) as s_today,
      sum(s.price_total) filter (where coalesce(s.ended_at, s.ends_at, s.started_at) >= p_week)  as s_week,
      sum(s.price_total) filter (where coalesce(s.ended_at, s.ends_at, s.started_at) >= p_month) as s_month,
      sum(s.price_total)                                                                          as s_all,
      count(*) filter (where coalesce(s.ended_at, s.ends_at, s.started_at) >= p_today)::int       as cnt_today
    from public.sessions s
    where s.org_id = p_org_id and s.status = 'completed'
    group by s.venue_id
  ),
  bar as (
    select b.venue_id,
      sum(b.total) filter (where b.created_at >= p_today) as b_today,
      sum(b.total) filter (where b.created_at >= p_week)  as b_week,
      sum(b.total) filter (where b.created_at >= p_month) as b_month,
      sum(b.total)                                        as b_all
    from public.bar_sales b
    where b.org_id = p_org_id and b.voided_at is null
    group by b.venue_id
  ),
  merged as (
    select v.id, v.name, v.venue_type,
      coalesce(sess.s_today, 0) + coalesce(bar.b_today, 0) as today,
      coalesce(sess.s_week, 0)  + coalesce(bar.b_week, 0)  as week,
      coalesce(sess.s_month, 0) + coalesce(bar.b_month, 0) as month,
      coalesce(sess.s_all, 0)   + coalesce(bar.b_all, 0)   as all_time,
      coalesce(sess.cnt_today, 0) as sessions_today
    from v
    left join sess on sess.venue_id = v.id
    left join bar  on bar.venue_id  = v.id
  )
  select jsonb_build_object(
    'venues', coalesce(jsonb_agg(jsonb_build_object(
        'venue_id',       id,
        'name',           name,
        'venue_type',     venue_type,
        'today',          round(today, 2),
        'week',           round(week, 2),
        'month',          round(month, 2),
        'all',            round(all_time, 2),
        'sessions_today', sessions_today
      ) order by today desc, name), '[]'::jsonb),
    'totals', jsonb_build_object(
        'today', round(coalesce(sum(today), 0), 2),
        'week',  round(coalesce(sum(week), 0), 2),
        'month', round(coalesce(sum(month), 0), 2),
        'all',   round(coalesce(sum(all_time), 0), 2)
      )
  ) into v_result
  from merged;

  -- club-wide payment split for TODAY (sessions + bar, all venues of the org)
  select jsonb_build_object(
    'cash', round(
      coalesce((select sum(price_total) filter (where payment_method = 'cash') from public.sessions
                where org_id = p_org_id and status = 'completed'
                  and coalesce(ended_at, ends_at, started_at) >= p_today), 0)
    + coalesce((select sum(total) filter (where payment_method = 'cash') from public.bar_sales
                where org_id = p_org_id and voided_at is null and created_at >= p_today), 0), 2),
    'card', round(
      coalesce((select sum(price_total) filter (where payment_method = 'card') from public.sessions
                where org_id = p_org_id and status = 'completed'
                  and coalesce(ended_at, ends_at, started_at) >= p_today), 0)
    + coalesce((select sum(total) filter (where payment_method = 'card') from public.bar_sales
                where org_id = p_org_id and voided_at is null and created_at >= p_today), 0), 2),
    'transfer', round(
      coalesce((select sum(price_total) filter (where payment_method = 'transfer') from public.sessions
                where org_id = p_org_id and status = 'completed'
                  and coalesce(ended_at, ends_at, started_at) >= p_today), 0)
    + coalesce((select sum(total) filter (where payment_method = 'transfer') from public.bar_sales
                where org_id = p_org_id and voided_at is null and created_at >= p_today), 0), 2)
  ) into v_pay;

  return v_result || jsonb_build_object('payments', v_pay);
end;
$$;
revoke all on function public.get_org_overview(uuid, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_org_overview(uuid, timestamptz, timestamptz, timestamptz) to authenticated;
