-- 0070 AI Closing Brief — one consolidated daily snapshot for the AI manager.
--
-- get_daily_brief_data gathers everything the owner cares about for a given day
-- (Tbilisi): revenue vs yesterday, sessions/hours, top + idle consoles, peak
-- hour, suspicious actions, low stock, hardware-health warnings. The ai-assistant
-- edge fn (Path E: run_daily_brief) feeds this JSON to Gemini → a plain-Georgian
-- executive brief. The "intelligence moat" — synthesises sessions, bar, RevPACH,
-- fraud, COGS, hardware health in one read.

create or replace function public.get_daily_brief_data(p_venue_id uuid, p_date date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_start timestamptz; v_end timestamptz; v_ystart timestamptz;
  v_rev_today numeric; v_rev_yest numeric; v_bar_today numeric; v_bar_yest numeric;
  v_sessions_today int; v_hours_today numeric;
  v_top jsonb; v_idle jsonb; v_peak int;
  v_cancels int; v_voids int; v_refunds int;
  v_lowstock jsonb; v_hwwarn jsonb;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;

  v_start  := (p_date::timestamp) at time zone 'Asia/Tbilisi';
  v_end    := v_start + interval '1 day';
  v_ystart := v_start - interval '1 day';

  select coalesce(sum(price_total), 0), count(*),
         coalesce(round(sum(least(24, greatest(0, extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600.0)))), 0)
    into v_rev_today, v_sessions_today, v_hours_today
    from public.sessions
    where venue_id = p_venue_id and status = 'completed' and started_at >= v_start and started_at < v_end;

  select coalesce(sum(price_total), 0) into v_rev_yest
    from public.sessions
    where venue_id = p_venue_id and status = 'completed' and started_at >= v_ystart and started_at < v_start;

  select coalesce(sum(total), 0) into v_bar_today
    from public.bar_sales where venue_id = p_venue_id and voided_at is null and created_at >= v_start and created_at < v_end;
  select coalesce(sum(total), 0) into v_bar_yest
    from public.bar_sales where venue_id = p_venue_id and voided_at is null and created_at >= v_ystart and created_at < v_start;

  select to_jsonb(t) into v_top from (
    select c.name, coalesce(sum(s.price_total), 0)::numeric as revenue
    from public.consoles c
    join public.sessions s on s.console_id = c.id and s.status = 'completed' and s.started_at >= v_start and s.started_at < v_end
    where c.venue_id = p_venue_id
    group by c.name order by revenue desc limit 1
  ) t;

  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_idle from (
    select c.name from public.consoles c
    where c.venue_id = p_venue_id and c.deleted_at is null
      and not exists (
        select 1 from public.sessions s
        where s.console_id = c.id and s.status = 'completed' and s.started_at >= v_start and s.started_at < v_end)
  ) i;

  select extract(hour from (started_at at time zone 'Asia/Tbilisi'))::int into v_peak
    from public.sessions
    where venue_id = p_venue_id and status = 'completed' and started_at >= v_start and started_at < v_end
    group by 1 order by count(*) desc limit 1;

  select count(*) filter (where action = 'session.cancel'),
         count(*) filter (where action = 'bar_sale.void'),
         count(*) filter (where action = 'session.refund')
    into v_cancels, v_voids, v_refunds
    from public.audit_logs where venue_id = p_venue_id and created_at >= v_start and created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'stock', stock_quantity) order by stock_quantity), '[]'::jsonb)
    into v_lowstock from (
      select name, stock_quantity from public.bar_products
      where org_id = v_org and is_active
        and stock_quantity is not null and low_stock_threshold is not null and stock_quantity <= low_stock_threshold
      order by stock_quantity limit 10
    ) l;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'health', hardware_health_score, 'sessions', total_sessions_count) order by hardware_health_score), '[]'::jsonb)
    into v_hwwarn from (
      select name, hardware_health_score, total_sessions_count from public.consoles
      where venue_id = p_venue_id and deleted_at is null and hardware_health_score <= 50
      order by hardware_health_score limit 10
    ) h;

  return jsonb_build_object(
    'date', p_date,
    'revenue_today', round(v_rev_today + v_bar_today, 2),
    'sessions_revenue_today', round(v_rev_today, 2),
    'bar_revenue_today', round(v_bar_today, 2),
    'revenue_yesterday', round(v_rev_yest + v_bar_yest, 2),
    'sessions_today', v_sessions_today,
    'hours_today', v_hours_today,
    'top_console', v_top,
    'idle_consoles', v_idle,
    'peak_hour_tbilisi', v_peak,
    'cancels_today', coalesce(v_cancels, 0),
    'voids_today', coalesce(v_voids, 0),
    'refunds_today', coalesce(v_refunds, 0),
    'low_stock', v_lowstock,
    'hardware_warnings', v_hwwarn
  );
end;
$$;

revoke all on function public.get_daily_brief_data(uuid, date) from public, anon;
grant execute on function public.get_daily_brief_data(uuid, date) to authenticated;
