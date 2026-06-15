-- 0061 In-Seat portal: per-session access code (PIN + QR), kills the static-QR edge.
--
-- 0060 gated portal writes on a LIVE session, but the QR is still static per
-- console — so during a NEW customer's session, an OLD customer who screenshotted
-- the same QR could still order onto the new tab. Fix: every session now gets a
-- rotating 6-digit `portal_code`. A customer must prove they hold the current
-- code (typed PIN, or scanned from a session QR that embeds &k=<code>) before any
-- write. The code is generated on session start and dies when the session ends.

-- ---------------------------------------------------------------------------
-- 1. portal_code on sessions — generated for every session via a BEFORE trigger
--    (covers all start paths: start_session / start_open_session / future ones).
-- ---------------------------------------------------------------------------
alter table public.sessions add column if not exists portal_code text;

create or replace function public.gen_session_portal_code()
returns trigger
language plpgsql
as $$
begin
  if new.portal_code is null then
    new.portal_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_session_portal_code on public.sessions;
create trigger trg_session_portal_code
  before insert on public.sessions
  for each row execute function public.gen_session_portal_code();

-- Backfill currently-live sessions so in-flight players aren't locked out at deploy.
update public.sessions
  set portal_code = lpad((floor(random() * 1000000))::int::text, 6, '0')
  where status = 'active' and portal_code is null;

-- ---------------------------------------------------------------------------
-- 2. portal_unlock — public; verifies the code against the live session.
--    Returns the same shape as portal_get_session_status on success.
--    Rate-limited per console (definer can call ratelimit.check despite the
--    anon-only grant) so the 6-digit space can't be brute-forced.
-- ---------------------------------------------------------------------------
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
  v_venue   uuid;
  v_session uuid;
  v_code    text;
  v_ends    timestamptz;
  v_plan    text;
begin
  -- throttle guesses: 20 attempts / minute / console
  begin
    perform ratelimit.check('portal_unlock:' || p_console_id, 20);
  exception when others then
    return jsonb_build_object('error', 'rate_limited');
  end;

  select name, venue_id into v_name, v_venue
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
    'active', true,
    'plan_name', v_plan,
    'ends_at', v_ends,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends - now())) / 60))::int
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. portal_place_order — now takes p_code and requires it to match the session.
--    Drop the old 3-arg signature so anon can't bypass the code via the overload.
-- ---------------------------------------------------------------------------
drop function if exists public.portal_place_order(uuid, int, jsonb);

create or replace function public.portal_place_order(
  p_venue_id   uuid,
  p_console_id int,
  p_items      jsonb,
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
  v_pending       int;
  v_item          jsonb;
  v_pid           int;
  v_qty           int;
  v_price         numeric(10,2);
  v_name          text;
  v_total         numeric(10,2) := 0;
  v_snap          jsonb := '[]'::jsonb;
  v_session       uuid;
  v_code          text;
  v_req           uuid;
begin
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

  -- Live session + matching per-session code (kills the screenshotted-QR edge).
  select id, portal_code into v_session, v_code from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;
  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('error', 'empty_cart');
  end if;

  select count(*) into v_pending from public.service_requests
    where console_id = p_console_id and kind = 'order' and status = 'pending';
  if v_pending >= 5 then
    return jsonb_build_object('error', 'too_many_pending');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::int;
    v_qty := least(20, greatest(1, coalesce((v_item->>'qty')::int, 1)));
    select name, price into v_name, v_price
      from public.bar_products where id = v_pid and org_id = v_org and is_active;
    if v_price is null then return jsonb_build_object('error', 'product_unavailable'); end if;
    v_snap := v_snap || jsonb_build_object(
      'product_id', v_pid, 'name', v_name, 'unit_price', v_price,
      'qty', v_qty, 'line_total', round(v_price * v_qty, 2));
    v_total := v_total + round(v_price * v_qty, 2);
  end loop;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, items, total, status)
    values (v_org, p_venue_id, p_console_id, v_session, 'order', v_snap, v_total, 'pending')
    returning id into v_req;

  return jsonb_build_object('ok', true, 'request_id', v_req, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. portal_request_service — now takes p_code too.
-- ---------------------------------------------------------------------------
drop function if exists public.portal_request_service(uuid, int, text);

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
  if p_kind not in ('battery', 'call') then
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

-- ---------------------------------------------------------------------------
-- 5. Grants — re-grant (DROP wiped them for the two recreated functions).
-- ---------------------------------------------------------------------------
revoke all on function public.portal_unlock(uuid, int, text)               from public;
revoke all on function public.portal_place_order(uuid, int, jsonb, text)   from public;
revoke all on function public.portal_request_service(uuid, int, text, text) from public;

grant execute on function public.portal_unlock(uuid, int, text)               to anon, authenticated;
grant execute on function public.portal_place_order(uuid, int, jsonb, text)   to anon, authenticated;
grant execute on function public.portal_request_service(uuid, int, text, text) to anon, authenticated;
