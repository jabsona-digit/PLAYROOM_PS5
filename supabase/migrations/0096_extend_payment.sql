-- 0096 - Extend-time payment (hybrid, mirrors the bar tab) — closes a money leak.
--
-- Before: extend_session always added the extension cost to sessions.price_total, and a
-- FIXED session's price_total is shown as fully PREPAID (green) in the bill — so a
-- portal extension appeared PAID the moment the operator confirmed, with no money taken.
--
-- After: an extension is either PAID-NOW (cash/card/transfer -> added to price_total =
-- revenue, green) or ON-TAB (owed -> NOT in price_total, shown red, settled at session
-- end like the bar tab). The customer picks on the portal; the operator just confirms.
-- Admin desk-extend (2-arg call from store.tsx) keeps the paid/green default.
-- All Georgian labels live in the frontend; this migration stays ASCII.

-- 1) track how each extension is paid. on_tab=true => owed (red) until settled.
alter table public.session_extensions
  add column if not exists on_tab         boolean not null default false,
  add column if not exists payment_method text,
  add column if not exists bank           text,
  add column if not exists settled_at     timestamptz;

-- 2) extend_session: time always; cost into price_total ONLY when paid now (not on tab,
--    fixed session). New optional args default to paid/green so the admin path is unchanged.
drop function if exists public.extend_session(uuid, int);
create or replace function public.extend_session(
  p_session_id     uuid,
  p_extra_min      int,
  p_on_tab         boolean default false,
  p_payment_method text default null,
  p_bank           text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pph     numeric(10,2);
  v_org     uuid;
  v_is_open boolean;
  v_extra   numeric(10,2);
begin
  select price_per_hour, org_id, is_open into v_pph, v_org, v_is_open
    from public.sessions where id = p_session_id;
  if v_pph is null then raise exception 'session_not_found'; end if;

  v_extra := round((p_extra_min / 60.0) * v_pph, 2);

  insert into public.session_extensions
    (org_id, session_id, extra_minutes, extra_price, on_tab, payment_method, bank)
  values
    (v_org, p_session_id, p_extra_min, v_extra, coalesce(p_on_tab, false), p_payment_method, p_bank);

  update public.sessions
     set ends_at = ends_at + make_interval(mins => p_extra_min),
         price_total = case
           when v_is_open then price_total                       -- open bills by elapsed time
           when coalesce(p_on_tab, false) then price_total       -- on tab: not revenue yet
           else round(price_total + v_extra, 2)                  -- paid now: recognize revenue
         end
   where id = p_session_id;
end;
$$;
revoke all on function public.extend_session(uuid, int, boolean, text, text) from public, anon;
grant execute on function public.extend_session(uuid, int, boolean, text, text) to authenticated;

-- 3) compute_session_bill: add owed extensions (on tab, unsettled) to the RED side.
--    Frontend renders the Georgian label from the new `tab_extension` number.
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
  v_ext_tab numeric;
begin
  select is_open, started_at, price_per_hour, ended_at, price_total
    into v_is_open, v_started, v_pph, v_ended, v_price
  from public.sessions where id = p_session_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if v_is_open and v_ended is null then
    v_play := round(least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5)) / 60.0 * v_pph, 2);
    v_play_paid := false;
  else
    v_play := coalesce(v_price, 0);
    v_play_paid := not v_is_open;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', bi.name, 'qty', bi.qty, 'line_total', bi.line_total) order by bi.id), '[]'::jsonb),
         coalesce(sum(bi.line_total), 0)
    into v_paid, v_paid_total
  from public.bar_sales bs
  join public.bar_sale_items bi on bi.sale_id = bs.id
  where bs.session_id = p_session_id and bs.voided_at is null and bs.payment_method is not null;

  select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', (it->>'qty')::int, 'line_total', (it->>'line_total')::numeric)), '[]'::jsonb),
         coalesce(sum((it->>'line_total')::numeric), 0)
    into v_tab, v_tab_total
  from public.service_requests sr
  cross join lateral jsonb_array_elements(sr.items) it
  where sr.session_id = p_session_id and sr.kind = 'order' and sr.status = 'delivered';

  -- owed time-extensions (on tab, not yet settled) -> red
  select coalesce(sum(extra_price), 0) into v_ext_tab
  from public.session_extensions
  where session_id = p_session_id and on_tab and settled_at is null;

  return jsonb_build_object(
    'is_open', v_is_open,
    'play_amount', v_play, 'play_paid', v_play_paid,
    'paid_items', v_paid, 'paid_bar_total', round(v_paid_total, 2),
    'tab_items', v_tab, 'tab_total', round(v_tab_total, 2),
    'tab_extension', round(v_ext_tab, 2),
    'green_total', round((case when v_play_paid then v_play else 0 end) + v_paid_total, 2),
    'red_total',   round((case when v_play_paid then 0 else v_play end) + v_tab_total + v_ext_tab, 2),
    'grand_total', round(v_play + v_paid_total + v_tab_total + v_ext_tab, 2)
  );
end;
$$;
revoke all on function public.compute_session_bill(uuid) from public, anon, authenticated;

-- 4) settle_session_tab: settle the bar tab AND owed extensions (extension cost -> revenue).
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
  v_org uuid; v_venue uuid; v_total numeric := 0; v_sale uuid; v_reqs uuid[]; v_ext numeric := 0;
begin
  select org_id, venue_id into v_org, v_venue from public.sessions where id = p_session_id;
  if v_org is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'unauthorized'; end if;
  if p_payment_method not in ('cash', 'card', 'transfer') then raise exception 'invalid_payment_method'; end if;

  select array_agg(id), coalesce(sum(total), 0) into v_reqs, v_total
  from public.service_requests
  where session_id = p_session_id and kind = 'order' and status = 'delivered';

  select coalesce(sum(extra_price), 0) into v_ext
  from public.session_extensions
  where session_id = p_session_id and on_tab and settled_at is null;

  if v_reqs is null and v_ext = 0 then
    return jsonb_build_object('ok', true, 'settled_total', 0, 'nothing', true);
  end if;

  -- bar tab -> one paid bar_sale (stock already deducted at delivery)
  if v_reqs is not null then
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
  end if;

  -- owed extensions -> recognize as session revenue now + mark settled
  if v_ext > 0 then
    update public.session_extensions
      set settled_at = now(), payment_method = p_payment_method, bank = p_bank
      where session_id = p_session_id and on_tab and settled_at is null;
    update public.sessions set price_total = round(coalesce(price_total, 0) + v_ext, 2)
      where id = p_session_id;
  end if;

  perform public.log_audit(v_org, v_venue, 'session.tab_settled', 'session', p_session_id::text,
    jsonb_build_object('bar_total', round(v_total, 2), 'extension_total', round(v_ext, 2),
                       'method', p_payment_method, 'sale_id', v_sale));

  return jsonb_build_object('ok', true, 'settled_total', round(v_total + v_ext, 2),
                            'extension_total', round(v_ext, 2), 'sale_id', v_sale);
end;
$$;
revoke all on function public.settle_session_tab(uuid, text, text) from public, anon;
grant execute on function public.settle_session_tab(uuid, text, text) to authenticated;

-- 5) portal_request_extend: carry the customer's payment choice (pay now method | tab).
drop function if exists public.portal_request_extend(uuid, int, text, int);
create or replace function public.portal_request_extend(
  p_venue_id   uuid,
  p_console_id int,
  p_code       text,
  p_minutes    int,
  p_pay        text default 'tab',
  p_bank       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_session uuid;
  v_code    text;
  v_min     int := greatest(15, least(240, coalesce(p_minutes, 0)));
  v_pay     text := case when p_pay in ('cash','card','transfer','tab') then p_pay else 'tab' end;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;

  select s.id, s.portal_code into v_session, v_code
    from public.sessions s
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc limit 1;
  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;

  if exists (
    select 1 from public.service_requests
    where console_id = p_console_id and kind = 'extend' and status = 'pending'
      and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'dedup', true);
  end if;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, items, status)
    values (v_org, p_venue_id, p_console_id, v_session, 'extend',
            jsonb_build_array(jsonb_build_object('minutes', v_min, 'pay', v_pay, 'bank', p_bank)), 'pending');

  return jsonb_build_object('ok', true, 'minutes', v_min, 'pay', v_pay);
end;
$$;
revoke all on function public.portal_request_extend(uuid, int, text, int, text, text) from public;
grant execute on function public.portal_request_extend(uuid, int, text, int, text, text) to anon, authenticated;

-- 6) resolve_service_request (rebased on 0089 + extend branch now passes the pay choice).
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
  v_avail int;
  v_name  text;
begin
  select * into v_req from public.service_requests where id = p_id;
  if v_req.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_req.org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;
  if v_req.status <> 'pending' then return jsonb_build_object('error', 'already_resolved'); end if;

  -- Extend: confirm -> apply minutes; cost is paid-now (green) or on tab (red) per the
  -- customer's portal choice (items[0].pay), overridable by the operator (p_payment_method).
  if p_status = 'done' and v_req.kind = 'extend' then
    if v_req.session_id is not null then
      perform public.extend_session(
        v_req.session_id,
        greatest(1, coalesce((v_req.items->0->>'minutes')::int, 0)),
        (coalesce(p_payment_method, v_req.items->0->>'pay', 'tab') = 'tab'),
        nullif(coalesce(p_payment_method, v_req.items->0->>'pay'), 'tab'),
        coalesce(p_bank, v_req.items->0->>'bank')
      );
    end if;
    update public.service_requests
      set status = 'done', resolved_at = now(), resolved_by = auth.uid() where id = p_id;
    return jsonb_build_object('ok', true, 'extended', true);
  end if;

  -- On-tab order: deliver now, settle at session end. Guard stock, then deduct.
  if p_status = 'done' and v_req.kind = 'order' and p_on_tab then
    for v_it in select * from jsonb_array_elements(v_req.items) loop
      select stock_quantity, name into v_avail, v_name
        from public.bar_products where id = (v_it->>'product_id')::int;
      if coalesce(v_avail, 0) < (v_it->>'qty')::int then
        return jsonb_build_object('error', 'insufficient_stock', 'product', v_name, 'available', coalesce(v_avail, 0));
      end if;
    end loop;
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

  -- Pay-now order -> ring up a real (paid) bar_sale (create_bar_sale guards stock).
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
