-- 0090 - stop the customer ordering more than is in stock (order-time block + menu signal).
--
-- 0089 guards the fulfillment side (operator can't deliver more than stock). This adds the
-- earlier, friendlier guard: the /p menu now knows each product's stock so it can show
-- "out of stock" and cap quantities, and portal_place_order rejects an over-stock order
-- outright. stock_quantity NULL = untracked = unlimited (no block).

-- 1) menu carries stock so the client can grey-out / cap.
create or replace function public.portal_get_menu(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org        uuid;
  v_venue_name text;
  v_cats       jsonb;
  v_prods      jsonb;
begin
  select org_id, name into v_org, v_venue_name from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                            order by c.sort_order, c.name), '[]'::jsonb)
    into v_cats
    from public.bar_categories c
    where c.org_id = v_org and c.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id, 'category_id', p.category_id, 'name', p.name, 'price', p.price,
            'stock', p.stock_quantity)
            order by p.name), '[]'::jsonb)
    into v_prods
    from public.bar_products p
    where p.org_id = v_org and p.is_active;

  return jsonb_build_object('venue_name', v_venue_name, 'categories', v_cats, 'products', v_prods);
end;
$$;

-- 2) order-time block: reject an order line that exceeds stock.
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
  v_stock         int;
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
    select name, price, stock_quantity into v_name, v_price, v_stock
      from public.bar_products where id = v_pid and org_id = v_org and is_active;
    if v_price is null then return jsonb_build_object('error', 'product_unavailable'); end if;
    -- NULL stock = untracked = unlimited; otherwise don't let the order exceed it.
    if v_stock is not null and v_stock < v_qty then
      return jsonb_build_object('error', 'insufficient_stock', 'product', v_name, 'available', v_stock);
    end if;
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
