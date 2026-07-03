-- 0145 - Full-audit cleanup (2026-07-03 strict audit): overload consolidation,
-- least-privilege on internal helpers, crypto-ledger hygiene.
--
-- Findings fixed here:
--  A) create_bar_sale had TWO overloads (old 7-arg jsonb INVOKER + new 8-arg json
--     DEFINER). Every live caller passes p_tip so resolution was unique TODAY, but
--     any future call with the old 7-name set is PGRST203-ambiguous = broken sale.
--     Also: the 8-arg took p_customer_name/p_created_by but NEVER WROTE THEM (dead
--     params — POS sales lost operator attribution), and it sold inactive products.
--     Fix: one canonical 8-arg that persists customer_name/created_by and filters
--     is_active (parity with the old in-seat fn), then DROP the old 7-arg.
--  B) resolve_service_request called the old 7-arg POSITIONALLY — recreated to call
--     the canonical one with named args (items jsonb -> json cast, tip 0).
--  C) create_organization old 3-arg overload (superseded by 0139's 4-arg with
--     p_contact_phone default) — same ambiguity class; onboarding always sends the
--     phone. DROP the old one.
--  D) org_plan/require_plan are INTERNAL plan-gating helpers but were anon-executable
--     (org_plan leaks any org's plan tier by uuid). Revoke anon; keep authenticated
--     (BEFORE triggers run as the DML role and need them) + service_role.
--  E) crypto_payments: abandoned NOWPayments checkouts sat as 'waiting' forever.
--     One-time sweep >24h -> 'expired' + a daily pg_cron sweep.

-- ── A) canonical create_bar_sale ──────────────────────────────────────────────
create or replace function public.create_bar_sale(
  p_venue_id uuid, p_payment_method text, p_items json,
  p_bank text default null, p_session_id uuid default null,
  p_customer_name text default null, p_created_by integer default null,
  p_tip numeric default 0)
returns uuid
language plpgsql security definer
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
  perform ratelimit.check('create_bar_sale:' || coalesce(auth.uid()::text, 'anon'), 60);
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if p_tip < 0 then raise exception 'invalid_tip'; end if;

  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'invalid_payment_method';
  end if;
  if p_payment_method = 'cash' then
    p_bank := null;
  elsif p_bank is null or p_bank not in ('TBC', 'BOG') then
    raise exception 'invalid_bank';
  end if;

  if p_session_id is not null
     and not exists (select 1 from public.sessions where id = p_session_id and org_id = v_org_id) then
    raise exception 'session_not_found';
  end if;

  insert into public.bar_sales
    (org_id, venue_id, payment_method, bank, session_id, customer_name, created_by, tip_amount, total)
  values
    (v_org_id, p_venue_id, p_payment_method, p_bank, p_session_id, p_customer_name, p_created_by, coalesce(p_tip, 0), 0)
  returning id into v_sale_id;

  for v_item in select * from json_array_elements(p_items) loop
    select id, price, cost_price, name, stock_quantity
    into v_product
    from public.bar_products
    where id = (v_item->>'product_id')::integer
      and org_id = v_org_id
      and is_active;

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

  update public.bar_sales set total = v_total where id = v_sale_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'bar_sale.create', 'bar_sale', v_sale_id::text,
    jsonb_build_object('total', v_total, 'tip', p_tip, 'method', p_payment_method)
  );

  return v_sale_id;
end;
$function$;

-- ── B) resolve_service_request -> canonical named-arg call ────────────────────
create or replace function public.resolve_service_request(
  p_id uuid, p_status text default 'done', p_payment_method text default null,
  p_bank text default null, p_on_tab boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
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
      p_venue_id       => v_req.venue_id,
      p_payment_method => p_payment_method,
      p_items          => coalesce(v_items, '[]'::jsonb)::json,
      p_bank           => p_bank,
      p_session_id     => v_req.session_id,
      p_customer_name  => 'In-Seat #' || v_req.console_id,
      p_tip            => 0);
  end if;

  update public.service_requests
    set status = p_status, resolved_at = now(), resolved_by = auth.uid(), sale_id = v_sale
    where id = p_id;
  return jsonb_build_object('ok', true, 'sale_id', v_sale);
end;
$function$;

-- ── C) drop the superseded overloads ──────────────────────────────────────────
drop function if exists public.create_bar_sale(uuid, text, text, jsonb, text, uuid, integer);
drop function if exists public.create_organization(text, text, text);

-- ── D) least-privilege on internal plan helpers ───────────────────────────────
revoke execute on function public.org_plan(uuid) from public, anon;
revoke execute on function public.require_plan(uuid, text) from public, anon;
grant execute on function public.org_plan(uuid) to authenticated, service_role;
grant execute on function public.require_plan(uuid, text) to authenticated, service_role;

-- ── E) crypto ledger hygiene ──────────────────────────────────────────────────
update public.crypto_payments
   set status = 'expired', updated_at = now()
 where status = 'waiting' and created_at < now() - interval '24 hours';

select cron.schedule(
  'expire-stale-crypto', '30 3 * * *',
  $job$update public.crypto_payments set status='expired', updated_at=now()
       where status='waiting' and created_at < now() - interval '24 hours'$job$)
 where not exists (select 1 from cron.job where jobname = 'expire-stale-crypto');
