-- 0092 - API gateway backing functions (Phase 2).
--
-- The edge gateway (supabase/functions/api-gateway) has NO user JWT: it authenticates
-- the API key via verify_api_key (0091), gets the owning org, then calls these as
-- service_role. So every function takes p_org_id EXPLICITLY, is SECURITY DEFINER, and
-- is granted to service_role only (never anon/authenticated). They mirror existing
-- logic (see 0063 hardware model) without the auth.uid()/RLS dependence.

-- api_device_list: what each console's relay SHOULD be ('power'), for the local agent
-- (Raspberry Pi / ESP32) to poll. desired_state wins; otherwise derive from the live
-- session (active => on). Also returns the hardware config so the agent knows the driver.
create or replace function public.api_device_list(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'console_id',       c.id,
    'name',             c.name,
    'type',             c.console_type,
    'control_mode',     coalesce(hw.control_mode, 'manual'),
    'driver',           coalesce(hw.driver, 'none'),
    'target',           coalesce(hw.target, 'tv'),
    'config',           coalesce(hw.config, '{}'::jsonb),
    'power',            coalesce(hw.desired_state, case when s.id is not null then 'on' else 'off' end),
    'last_known_state', coalesce(hw.last_known_state, 'unknown'),
    'session_active',   s.id is not null,
    'session_ends_at',  s.ends_at
  ) order by c.id), '[]'::jsonb)
  from public.consoles c
  left join public.console_hardware hw on hw.console_id = c.id
  left join lateral (
    select id, ends_at from public.sessions
    where console_id = c.id and status = 'active'
    order by started_at desc limit 1
  ) s on true
  where c.org_id = p_org_id and c.deleted_at is null;
$$;

-- api_device_report: the agent acknowledges the ACTUAL relay state -> audit + state sync.
create or replace function public.api_device_report(
  p_org_id     uuid,
  p_console_id int,
  p_state      text,
  p_success    boolean default true,
  p_error      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ven uuid;
begin
  if p_state not in ('on', 'off') then return jsonb_build_object('error', 'bad_state'); end if;
  -- the key's org MUST own the console (cross-tenant guard)
  select venue_id into v_ven from public.consoles
    where id = p_console_id and org_id = p_org_id and deleted_at is null;
  if v_ven is null then return jsonb_build_object('error', 'console_not_found'); end if;

  insert into public.power_events
    (org_id, venue_id, console_id, session_id, action, triggered_by, operator_id, success, error_msg)
  select p_org_id, v_ven, p_console_id,
         (select id from public.sessions where console_id = p_console_id and status = 'active' limit 1),
         p_state, 'state_poll', null, coalesce(p_success, true), p_error;

  update public.console_hardware
    set last_known_state = p_state, last_seen_at = now()
    where console_id = p_console_id and org_id = p_org_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- api_list_sessions: recent sessions (read:sessions).
create or replace function public.api_list_sessions(p_org_id uuid, p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'console', c.name, 'status', s.status,
    'started_at', s.started_at, 'ends_at', s.ends_at,
    'price_total', s.price_total, 'is_open', s.is_open)
    order by s.started_at desc), '[]'::jsonb)
  from (
    select * from public.sessions where org_id = p_org_id
    order by started_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) s
  join public.consoles c on c.id = s.console_id;
$$;

-- api_analytics_summary: today's headline numbers (Tbilisi day) (read:analytics).
create or replace function public.api_analytics_summary(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'date', (now() at time zone 'Asia/Tbilisi')::date,
    'active_now', (
      select count(*) from public.sessions
      where org_id = p_org_id and status = 'active'),
    'sessions_today', (
      select count(*) from public.sessions
      where org_id = p_org_id
        and (started_at at time zone 'Asia/Tbilisi')::date = (now() at time zone 'Asia/Tbilisi')::date),
    'session_revenue_today', (
      select coalesce(sum(price_total), 0) from public.sessions
      where org_id = p_org_id and status = 'completed'
        and (started_at at time zone 'Asia/Tbilisi')::date = (now() at time zone 'Asia/Tbilisi')::date),
    'bar_revenue_today', (
      select coalesce(sum(total), 0) from public.bar_sales
      where org_id = p_org_id
        and (created_at at time zone 'Asia/Tbilisi')::date = (now() at time zone 'Asia/Tbilisi')::date)
  );
$$;

revoke all on function public.api_device_list(uuid)                              from public, anon, authenticated;
revoke all on function public.api_device_report(uuid, int, text, boolean, text)  from public, anon, authenticated;
revoke all on function public.api_list_sessions(uuid, int)                       from public, anon, authenticated;
revoke all on function public.api_analytics_summary(uuid)                        from public, anon, authenticated;
grant execute on function public.api_device_list(uuid)                              to service_role;
grant execute on function public.api_device_report(uuid, int, text, boolean, text)  to service_role;
grant execute on function public.api_list_sessions(uuid, int)                       to service_role;
grant execute on function public.api_analytics_summary(uuid)                        to service_role;
