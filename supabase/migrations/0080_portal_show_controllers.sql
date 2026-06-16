-- 0080 In-Seat portal — show the customer their joystick count + price.
--
-- Anti-fraud (customer as witness): if the operator starts a session as "2 joysticks"
-- (cheaper tier) while the customer actually plays with 4, the customer SEES "2
-- ჯოისტიკი" on the QR portal and complains — surfacing the under-ring. We just expose
-- the chosen plan's controllers + price_per_hour from the two portal session RPCs;
-- the client renders a verification nudge. Signatures unchanged → CREATE OR REPLACE
-- keeps the existing anon grants. Billiard tables ignore the joystick line client-side.

-- ── portal_get_session_status — also return controllers + price_per_hour ─────
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
  v_controllers  int;
  v_price        numeric;
begin
  select name, console_type, venue_id into v_console_name, v_console_type, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_name is null then return jsonb_build_object('error', 'console_not_found'); end if;

  select s.ends_at, pp.name, pp.controllers, pp.price_per_hour
    into v_ends_at, v_plan, v_controllers, v_price
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
    'controllers', v_controllers,
    'price_per_hour', v_price,
    'ends_at', v_ends_at,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends_at - now())) / 60))::int
  );
end;
$$;

-- ── portal_unlock — also return controllers + price_per_hour on success ──────
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
  v_name        text;
  v_type        text;
  v_venue       uuid;
  v_session     uuid;
  v_code        text;
  v_ends        timestamptz;
  v_plan        text;
  v_controllers int;
  v_price       numeric;
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

  select s.id, s.portal_code, s.ends_at, pp.name, pp.controllers, pp.price_per_hour
    into v_session, v_code, v_ends, v_plan, v_controllers, v_price
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
    'controllers', v_controllers,
    'price_per_hour', v_price,
    'ends_at', v_ends,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends - now())) / 60))::int
  );
end;
$$;
