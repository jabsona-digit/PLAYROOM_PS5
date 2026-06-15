-- 0060 In-Seat portal: require an ACTIVE session for every write action.
--
-- Bug: a console's QR is static (printed once and taped to the PS5). Both
-- portal_place_order and portal_request_service attached to the active session
-- "if any" — so AFTER a customer's session ended (status -> 'completed') the
-- very same QR still placed bar orders and pinged staff (ghost orders / abuse,
-- including anyone who merely screenshotted the code from their seat).
--
-- Fix: both RPCs now HARD-require a live session on the console and return
-- {error:'no_active_session'} otherwise. Read-only RPCs (portal_get_menu /
-- portal_get_session_status) are unchanged. CREATE OR REPLACE preserves the
-- existing anon/authenticated EXECUTE grants.

-- ---------------------------------------------------------------------------
-- portal_place_order — now gated on a live session
-- ---------------------------------------------------------------------------
create or replace function public.portal_place_order(
  p_venue_id   uuid,
  p_console_id int,
  p_items      jsonb
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
  v_req           uuid;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;

  select venue_id into v_console_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_venue is null or v_console_venue <> p_venue_id then
    return jsonb_build_object('error', 'console_mismatch');
  end if;

  -- Refuse if the tenant is suspended / not paying.
  if not exists (
    select 1 from public.organizations
    where id = v_org and subscription_status in ('active', 'trialing')
  ) then
    return jsonb_build_object('error', 'venue_unavailable');
  end if;

  -- Hard gate: there MUST be a live session on this console. Without it the
  -- static QR would keep ordering after the customer's session ended.
  select id into v_session from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('error', 'no_active_session');
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('error', 'empty_cart');
  end if;

  -- Anti-spam: cap pending orders per console.
  select count(*) into v_pending from public.service_requests
    where console_id = p_console_id and kind = 'order' and status = 'pending';
  if v_pending >= 5 then
    return jsonb_build_object('error', 'too_many_pending');
  end if;

  -- Price every line server-side from the live catalog (never trust the client).
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
-- portal_request_service — battery swap / call a waiter, now gated too
-- ---------------------------------------------------------------------------
create or replace function public.portal_request_service(
  p_venue_id   uuid,
  p_console_id int,
  p_kind       text
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

  -- Hard gate: only a live session may ping staff from the seat.
  select id into v_session from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('error', 'no_active_session');
  end if;

  -- De-dupe: ignore a repeat of the same request within 2 minutes (pretend success).
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
