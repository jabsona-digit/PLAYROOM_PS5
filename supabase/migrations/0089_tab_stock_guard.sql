-- 0089 - block over-selling on the "on-tab" path (stock must not go negative).
--
-- Bug: resolve_service_request's on-tab branch (0086) deducted stock with no check,
-- so fulfilling an order for more than is in stock drove stock_quantity negative
-- (2 in stock, order of 3 -> -1). Pay-now already guards this inside create_bar_sale.
-- Fix: verify EVERY line has enough stock BEFORE deducting any (no partial deduction);
-- otherwise reject with the short product + available count so the operator can restock.

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

  -- Extend: confirm -> apply minutes + cost to the live session.
  if p_status = 'done' and v_req.kind = 'extend' then
    if v_req.session_id is not null then
      perform public.extend_session(v_req.session_id, greatest(1, coalesce((v_req.items->0->>'minutes')::int, 0)));
    end if;
    update public.service_requests
      set status = 'done', resolved_at = now(), resolved_by = auth.uid() where id = p_id;
    return jsonb_build_object('ok', true, 'extended', true);
  end if;

  -- On-tab: deliver the order now, settle at session end. Guard stock, then deduct.
  if p_status = 'done' and v_req.kind = 'order' and p_on_tab then
    -- 1) check every line has enough stock (no partial deduction on failure)
    for v_it in select * from jsonb_array_elements(v_req.items) loop
      select stock_quantity, name into v_avail, v_name
        from public.bar_products where id = (v_it->>'product_id')::int;
      if coalesce(v_avail, 0) < (v_it->>'qty')::int then
        return jsonb_build_object('error', 'insufficient_stock', 'product', v_name, 'available', coalesce(v_avail, 0));
      end if;
    end loop;
    -- 2) deduct
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
