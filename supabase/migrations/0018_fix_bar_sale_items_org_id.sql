-- 0018 — Fix create_bar_sale: bar_sale_items.org_id is NOT NULL but the INSERT
-- never set it, so every bar sale failed with a not-null violation. Stamp the
-- org_id (already resolved from the venue) onto each line item.
create or replace function public.create_bar_sale(
  p_venue_id      uuid,
  p_payment_method text,
  p_items         json,
  p_bank          text default null,
  p_session_id    uuid default null,
  p_customer_name text default null,
  p_created_by    integer default null,
  p_tip           numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id  uuid;
  v_sale_id uuid;
  v_total   numeric := 0;
  v_item    json;
  v_product record;
  v_line    numeric;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  -- insert sale header (total filled after items)
  insert into public.bar_sales
    (org_id, venue_id, payment_method, bank, session_id, tip_amount, total)
  values
    (v_org_id, p_venue_id, p_payment_method, p_bank, p_session_id, coalesce(p_tip, 0), 0)
  returning id into v_sale_id;

  -- process line items
  for v_item in select * from json_array_elements(p_items) loop
    select id, price, cost_price, name, stock_quantity
    into v_product
    from public.bar_products
    where id = (v_item->>'product_id')::integer
      and org_id = v_org_id;

    if not found then raise exception 'product_not_found'; end if;
    if v_product.stock_quantity < (v_item->>'qty')::integer then
      raise exception 'insufficient_stock';
    end if;

    v_line := v_product.price * (v_item->>'qty')::integer;
    v_total := v_total + v_line;

    insert into public.bar_sale_items
      (org_id, sale_id, product_id, name, qty, unit_price, unit_cost_price, line_total)
    values
      (v_org_id, v_sale_id, v_product.id, v_product.name,
       (v_item->>'qty')::integer, v_product.price, v_product.cost_price, v_line);

    update public.bar_products
    set stock_quantity = stock_quantity - (v_item->>'qty')::integer
    where id = v_product.id;
  end loop;

  -- update total
  update public.bar_sales set total = v_total where id = v_sale_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'bar_sale.create', 'bar_sale', v_sale_id::text,
    jsonb_build_object('total', v_total, 'tip', p_tip, 'method', p_payment_method)
  );

  return v_sale_id;
end;
$function$;
