-- 0073 In-Seat portal — billiard-aware service options.
--
-- A billiard table has no controllers, so the QR portal's "ჯოისტიკი დაჯდა"
-- (battery) action is meaningless there. We (a) expose console_type from the two
-- portal session RPCs so the client can adapt, and (b) add an 'equipment' service
-- request kind (chalk / balls / cue) that billiard shows instead of battery.
-- Signatures are unchanged → CREATE OR REPLACE keeps the existing anon grants.

-- ── 1. allow the new 'equipment' kind ────────────────────────────────────────
alter table public.service_requests drop constraint if exists service_requests_kind_check;
alter table public.service_requests
  add constraint service_requests_kind_check
    check (kind in ('order', 'battery', 'call', 'equipment'));

-- ── 2. portal_get_session_status — expose console_type ───────────────────────
create or replace function public.portal_get_session_status(p_console_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_console_name text;
  v_console_type text;
  v_venue        uuid;
  v_ends_at      timestamptz;
  v_plan         text;
begin
  select name, console_type, venue_id into v_console_name, v_console_type, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_name is null then return jsonb_build_object('error', 'console_not_found'); end if;

  select s.ends_at, pp.name
    into v_ends_at, v_plan
    from public.sessions s
    join public.pricing_plans pp on pp.id = s.pricing_plan_id
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc
    limit 1;

  if v_ends_at is null then
    return jsonb_build_object('console_name', v_console_name, 'console_type', v_console_type, 'active', false);
  end if;

  return jsonb_build_object(
    'console_name', v_console_name,
    'console_type', v_console_type,
    'active', true,
    'plan_name', v_plan,
    'ends_at', v_ends_at,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends_at - now())) / 60))::int
  );
end;
$$;

-- ── 3. portal_unlock — also return console_type on success ────────────────────
create or replace function public.portal_unlock(
  p_venue_id   uuid,
  p_console_id int,
  p_code       text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_type    text;
  v_venue   uuid;
  v_session uuid;
  v_code    text;
  v_ends    timestamptz;
  v_plan    text;
begin
  begin
    perform ratelimit.check('portal_unlock:' || p_console_id, 20);
  exception when others then
    return jsonb_build_object('error', 'rate_limited');
  end;

  select name, console_type, venue_id into v_name, v_type, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_name is null then return jsonb_build_object('error', 'console_not_found'); end if;
  if v_venue <> p_venue_id then return jsonb_build_object('error', 'console_mismatch'); end if;

  select s.id, s.portal_code, s.ends_at, pp.name
    into v_session, v_code, v_ends, v_plan
    from public.sessions s
    join public.pricing_plans pp on pp.id = s.pricing_plan_id
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc
    limit 1;

  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;

  return jsonb_build_object(
    'ok', true,
    'console_name', v_name,
    'console_type', v_type,
    'active', true,
    'plan_name', v_plan,
    'ends_at', v_ends,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends - now())) / 60))::int
  );
end;
$$;

-- ── 4. portal_request_service — allow 'equipment' (billiard inventory) ────────
create or replace function public.portal_request_service(
  p_venue_id   uuid,
  p_console_id int,
  p_kind       text,
  p_code       text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org           uuid;
  v_console_venue uuid;
  v_session       uuid;
  v_code          text;
begin
  if p_kind not in ('battery', 'call', 'equipment') then
    return jsonb_build_object('error', 'bad_kind');
  end if;

  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;

  select venue_id into v_console_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_venue is null or v_console_venue <> p_venue_id then
    return jsonb_build_object('error', 'console_mismatch');
  end if;

  if not exists (
    select 1 from public.organizations
    where id = v_org and subscription_status in ('active', 'trialing')
  ) then
    return jsonb_build_object('error', 'venue_unavailable');
  end if;

  select id, portal_code into v_session, v_code from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;
  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;

  if exists (
    select 1 from public.service_requests
    where console_id = p_console_id and kind = p_kind and status = 'pending'
      and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'dedup', true);
  end if;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, status)
    values (v_org, p_venue_id, p_console_id, v_session, p_kind, 'pending');

  return jsonb_build_object('ok', true);
end;
$$;
