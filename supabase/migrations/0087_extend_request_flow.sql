-- 0087 - Customer-initiated time extension: request -> operator confirm -> applied.
--
-- Before: the portal "extend" button only pinged staff; nothing was added until the
-- operator manually extended. Now the customer picks minutes -> a kind='extend'
-- service_request (minutes in items) -> operator confirms in the inbox -> the time +
-- cost are applied via extend_session, and show in the customer's running bill.

-- 1) allow the new 'extend' request kind
alter table public.service_requests drop constraint if exists service_requests_kind_check;
alter table public.service_requests
  add constraint service_requests_kind_check
  check (kind in ('order','battery','call','equipment','extend'));

-- 2) portal_request_extend - anon; customer asks to add N minutes (code-gated)
create or replace function public.portal_request_extend(
  p_venue_id   uuid,
  p_console_id int,
  p_code       text,
  p_minutes    int
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
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;

  select s.id, s.portal_code into v_session, v_code
    from public.sessions s
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc limit 1;
  if v_session is null then return jsonb_build_object('error', 'no_active_session'); end if;
  if p_code is null or p_code <> v_code then return jsonb_build_object('error', 'bad_code'); end if;

  -- de-dupe a repeat extend request within 2 minutes
  if exists (
    select 1 from public.service_requests
    where console_id = p_console_id and kind = 'extend' and status = 'pending'
      and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'dedup', true);
  end if;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, items, status)
    values (v_org, p_venue_id, p_console_id, v_session, 'extend',
            jsonb_build_array(jsonb_build_object('minutes', v_min)), 'pending');

  return jsonb_build_object('ok', true, 'minutes', v_min);
end;
$$;
revoke all on function public.portal_request_extend(uuid, int, text, int) from public;
grant execute on function public.portal_request_extend(uuid, int, text, int) to anon, authenticated;

-- 3) resolve_service_request v3 - same as 0086 + an 'extend' branch (operator confirm
--    -> extend_session applies the minutes + cost to the live session).
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

  -- Extend: confirm -> apply minutes + cost to the live session.
  if p_status = 'done' and v_req.kind = 'extend' then
    if v_req.session_id is not null then
      perform public.extend_session(v_req.session_id, greatest(1, coalesce((v_req.items->0->>'minutes')::int, 0)));
    end if;
    update public.service_requests
      set status = 'done', resolved_at = now(), resolved_by = auth.uid() where id = p_id;
    return jsonb_build_object('ok', true, 'extended', true);
  end if;

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

  -- Pay-now order -> ring up a real (paid) bar_sale, linked to the session.
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
