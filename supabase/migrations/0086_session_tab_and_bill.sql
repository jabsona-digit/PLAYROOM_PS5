-- 0086 — Session tab + itemized receipt (hybrid: pay-now OR pay-at-end).
--
-- Clean revenue model: `bar_sales` stay PAID-only (revenue / P&L / cashier never see
-- an unpaid row). The unpaid "tab" lives as delivered-but-unsettled `service_requests`
-- (kind='order', status='delivered'), priced from the snapshot already stored at order
-- time. At the end the operator settles → ONE paid bar_sale for the whole tab. Stock is
-- deducted when an item is GIVEN (pay-now via create_bar_sale, or on-tab here), never twice.

-- 1) service_requests: add 'delivered' (on tab) + 'settled' statuses.
alter table public.service_requests drop constraint if exists service_requests_status_check;
alter table public.service_requests
  add constraint service_requests_status_check
  check (status in ('pending','done','dismissed','delivered','settled'));

-- 2) resolve_service_request v2: link the sale to the session on pay-now, plus an
--    on-tab path (deliver now, pay at end). Old 4-arg form dropped; new p_on_tab is
--    optional so the existing frontend call (4 named args) still resolves.
drop function if exists public.resolve_service_request(uuid, text, text, text);
create or replace function public.resolve_service_request(
  p_id             uuid,
  p_status         text default 'done',
  p_payment_method text default null,
  p_bank           text default null,
  p_on_tab         boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   public.service_requests;
  v_items jsonb;
  v_sale  uuid;
  v_it    jsonb;
begin
  select * into v_req from public.service_requests where id = p_id;
  if v_req.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_req.org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;
  if v_req.status <> 'pending' then return jsonb_build_object('error', 'already_resolved'); end if;

  -- On-tab: deliver the order now, settle at session end. Deduct stock; no sale yet.
  if p_status = 'done' and v_req.kind = 'order' and p_on_tab then
    for v_it in select * from jsonb_array_elements(v_req.items) loop
      update public.bar_products
        set stock_quantity = stock_quantity - (v_it->>'qty')::int
        where id = (v_it->>'product_id')::int;
    end loop;
    update public.service_requests
      set status = 'delivered', resolved_at = now(), resolved_by = auth.uid()
      where id = p_id;
    return jsonb_build_object('ok', true, 'on_tab', true, 'total', v_req.total);
  end if;

  if p_status not in ('done', 'dismissed') then raise exception 'bad_status'; end if;

  -- Pay-now order → ring up a real (paid) bar_sale, linked to the session.
  if p_status = 'done' and v_req.kind = 'order' and p_payment_method is not null then
    select jsonb_agg(jsonb_build_object('product_id', (it->>'product_id')::int, 'qty', (it->>'qty')::int))
      into v_items from jsonb_array_elements(v_req.items) it;
    v_sale := public.create_bar_sale(
      v_req.venue_id, p_payment_method, p_bank,
      coalesce(v_items, '[]'::jsonb), 'In-Seat #' || v_req.console_id, v_req.session_id);
  end if;

  update public.service_requests
    set status = p_status, resolved_at = now(), resolved_by = auth.uid(), sale_id = v_sale
    where id = p_id;
  return jsonb_build_object('ok', true, 'sale_id', v_sale);
end;
$$;
revoke all on function public.resolve_service_request(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.resolve_service_request(uuid, text, text, text, boolean) to authenticated;

-- 3) compute_session_bill — internal (no auth check); the two public wrappers below
--    add their own guard (org-member for the operator, portal code for the customer).
create or replace function public.compute_session_bill(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_open boolean; v_started timestamptz; v_pph numeric; v_ended timestamptz; v_price numeric;
  v_play numeric; v_play_paid boolean;
  v_paid jsonb; v_paid_total numeric; v_tab jsonb; v_tab_total numeric;
begin
  select is_open, started_at, price_per_hour, ended_at, price_total
    into v_is_open, v_started, v_pph, v_ended, v_price
  from public.sessions where id = p_session_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  -- play: fixed = prepaid price_total (green); open & running = live 5-min-rounded estimate (red)
  if v_is_open and v_ended is null then
    v_play := round(least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5)) / 60.0 * v_pph, 2);
    v_play_paid := false;
  else
    v_play := coalesce(v_price, 0);
    v_play_paid := not v_is_open;
  end if;

  -- paid bar (session-linked, not voided), itemized
  select coalesce(jsonb_agg(jsonb_build_object('name', bi.name, 'qty', bi.qty, 'line_total', bi.line_total) order by bi.id), '[]'::jsonb),
         coalesce(sum(bi.line_total), 0)
    into v_paid, v_paid_total
  from public.bar_sales bs
  join public.bar_sale_items bi on bi.sale_id = bs.id
  where bs.session_id = p_session_id and bs.voided_at is null and bs.payment_method is not null;

  -- tab: delivered (unsettled) order requests, itemized from the price snapshot
  select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', (it->>'qty')::int, 'line_total', (it->>'line_total')::numeric)), '[]'::jsonb),
         coalesce(sum((it->>'line_total')::numeric), 0)
    into v_tab, v_tab_total
  from public.service_requests sr
  cross join lateral jsonb_array_elements(sr.items) it
  where sr.session_id = p_session_id and sr.kind = 'order' and sr.status = 'delivered';

  return jsonb_build_object(
    'is_open', v_is_open,
    'play_amount', v_play, 'play_paid', v_play_paid,
    'paid_items', v_paid, 'paid_bar_total', round(v_paid_total, 2),
    'tab_items', v_tab, 'tab_total', round(v_tab_total, 2),
    'green_total', round((case when v_play_paid then v_play else 0 end) + v_paid_total, 2),
    'red_total',   round((case when v_play_paid then 0 else v_play end) + v_tab_total, 2),
    'grand_total', round(v_play + v_paid_total + v_tab_total, 2)
  );
end;
$$;
revoke all on function public.compute_session_bill(uuid) from public, anon, authenticated;

-- 3a) operator-facing bill (org-member guard)
create or replace function public.get_session_bill(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.sessions where id = p_session_id;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'unauthorized'; end if;
  return public.compute_session_bill(p_session_id);
end;
$$;
revoke all on function public.get_session_bill(uuid) from public, anon;
grant execute on function public.get_session_bill(uuid) to authenticated;

-- 3b) customer-facing bill (portal code guard, anon)
create or replace function public.portal_get_bill(p_console_id int, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_session uuid; v_code text;
begin
  select s.id, s.portal_code into v_session, v_code
  from public.sessions s where s.console_id = p_console_id and s.status = 'active'
  order by s.started_at desc limit 1;
  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;
  return public.compute_session_bill(v_session);
end;
$$;
revoke all on function public.portal_get_bill(int, text) from public;
grant execute on function public.portal_get_bill(int, text) to anon, authenticated;

-- 4) settle_session_tab — at the end, charge the whole delivered tab as ONE paid
--    bar_sale (stock already deducted at delivery → do NOT re-deduct) + mark settled.
create or replace function public.settle_session_tab(
  p_session_id uuid,
  p_payment_method text,
  p_bank text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_venue uuid; v_total numeric := 0; v_sale uuid; v_reqs uuid[];
begin
  select org_id, venue_id into v_org, v_venue from public.sessions where id = p_session_id;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'unauthorized'; end if;
  if p_payment_method not in ('cash', 'card', 'transfer') then raise exception 'invalid_payment_method'; end if;

  select array_agg(id), coalesce(sum(total), 0) into v_reqs, v_total
  from public.service_requests
  where session_id = p_session_id and kind = 'order' and status = 'delivered';
  if v_reqs is null then return jsonb_build_object('ok', true, 'settled_total', 0, 'nothing', true); end if;

  insert into public.bar_sales (org_id, venue_id, payment_method, bank, session_id, customer_name, total, tip_amount)
    values (v_org, v_venue, p_payment_method, p_bank, p_session_id, 'In-Seat Tab', round(v_total, 2), 0)
    returning id into v_sale;

  insert into public.bar_sale_items (org_id, sale_id, product_id, name, unit_price, unit_cost_price, qty, line_total)
  select v_org, v_sale, (it->>'product_id')::int, it->>'name', (it->>'unit_price')::numeric,
         coalesce((select cost_price from public.bar_products bp where bp.id = (it->>'product_id')::int), 0),
         (it->>'qty')::int, (it->>'line_total')::numeric
  from public.service_requests sr
  cross join lateral jsonb_array_elements(sr.items) it
  where sr.id = any(v_reqs);

  update public.service_requests set status = 'settled', sale_id = v_sale where id = any(v_reqs);

  perform public.log_audit(v_org, v_venue, 'session.tab_settled', 'session', p_session_id::text,
    jsonb_build_object('total', round(v_total, 2), 'method', p_payment_method, 'sale_id', v_sale));

  return jsonb_build_object('ok', true, 'settled_total', round(v_total, 2), 'sale_id', v_sale);
end;
$$;
revoke all on function public.settle_session_tab(uuid, text, text) from public, anon;
grant execute on function public.settle_session_tab(uuid, text, text) to authenticated;
