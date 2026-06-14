-- 0057 In-Seat Ordering portal (public, anonymous)
-- Customers scan a QR taped to their console — martelounge.ge/p?v=<venue>&c=<console>
-- — with NO login. They can browse the live bar menu, see their session timer,
-- place an order, or call staff (battery / waiter). NOTHING here writes a financial
-- record directly: orders land as PENDING `service_requests` that an operator
-- fulfills, which only THEN rings up the real bar_sale (server-priced). All public
-- access is via SECURITY DEFINER RPCs granted to `anon`; the table itself stays
-- anon-revoked and RLS-scoped to org members (the real boundary).

-- ---------------------------------------------------------------------------
-- 1. service_requests — the operator's live inbox
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  venue_id    uuid not null references public.venues(id)        on delete cascade,
  console_id  int  not null references public.consoles(id)      on delete cascade,
  session_id  uuid references public.sessions(id)               on delete set null,
  kind        text not null check (kind in ('order','battery','call')),
  items       jsonb not null default '[]'::jsonb,   -- snapshot: [{product_id,name,unit_price,qty,line_total}]
  total       numeric(10,2) not null default 0,
  status      text not null default 'pending' check (status in ('pending','done','dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,                                  -- auth.uid() of the operator who handled it
  sale_id     uuid references public.bar_sales(id) on delete set null  -- set when an order is rung up
);
create index service_requests_inbox_idx on public.service_requests(venue_id, status, created_at desc);
create index service_requests_org_id_idx on public.service_requests(org_id);
create index service_requests_console_pending_idx
  on public.service_requests(console_id, kind) where status = 'pending';

alter table public.service_requests enable row level security;

-- Operators/owners see + manage their own venue's requests (suspension-aware).
create policy "org_scope" on public.service_requests for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());

-- Anon has NO direct table access — only the SECURITY DEFINER RPCs below.
revoke all on public.service_requests from anon;

-- Live inbox for the operator (RLS still applies: members only get their org's rows).
alter publication supabase_realtime add table public.service_requests;

-- ---------------------------------------------------------------------------
-- 2. portal_get_menu — public live bar menu for a venue
-- ---------------------------------------------------------------------------
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
            'id', p.id, 'category_id', p.category_id, 'name', p.name, 'price', p.price)
            order by p.name), '[]'::jsonb)
    into v_prods
    from public.bar_products p
    where p.org_id = v_org and p.is_active;

  return jsonb_build_object('venue_name', v_venue_name, 'categories', v_cats, 'products', v_prods);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. portal_get_session_status — public, NO customer PII
-- ---------------------------------------------------------------------------
create or replace function public.portal_get_session_status(p_console_id int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_console_name text;
  v_venue        uuid;
  v_ends_at      timestamptz;
  v_plan         text;
begin
  select name, venue_id into v_console_name, v_venue
    from public.consoles where id = p_console_id and deleted_at is null;
  if v_console_name is null then return jsonb_build_object('error', 'console_not_found'); end if;

  select s.ends_at, pp.name
    into v_ends_at, v_plan
    from public.sessions s
    join public.pricing_plans pp on pp.id = s.pricing_plan_id
    where s.console_id = p_console_id and s.status = 'active'
    order by s.started_at desc
    limit 1;

  if v_ends_at is null then
    return jsonb_build_object('console_name', v_console_name, 'active', false);
  end if;

  return jsonb_build_object(
    'console_name', v_console_name,
    'active', true,
    'plan_name', v_plan,
    'ends_at', v_ends_at,
    'remaining_min', greatest(0, ceil(extract(epoch from (v_ends_at - now())) / 60))::int
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. portal_place_order — public; prices server-side; lands as a PENDING request
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

  -- Attach to the active session on this console, if any.
  select id into v_session from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, items, total, status)
    values (v_org, p_venue_id, p_console_id, v_session, 'order', v_snap, v_total, 'pending')
    returning id into v_req;

  return jsonb_build_object('ok', true, 'request_id', v_req, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. portal_request_service — public; battery swap / call a waiter
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

  -- De-dupe: ignore a repeat of the same request within 2 minutes (pretend success).
  if exists (
    select 1 from public.service_requests
    where console_id = p_console_id and kind = p_kind and status = 'pending'
      and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'dedup', true);
  end if;

  select id into v_session from public.sessions
    where console_id = p_console_id and status = 'active'
    order by started_at desc limit 1;

  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, status)
    values (v_org, p_venue_id, p_console_id, v_session, p_kind, 'pending');

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. resolve_service_request — operator-only; fulfils or dismisses a request.
--    For an 'order' marked done WITH a payment method, rings up the real
--    bar_sale (server-priced via create_bar_sale) and links it back.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_service_request(
  p_id             uuid,
  p_status         text default 'done',
  p_payment_method text default null,
  p_bank           text default null
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
begin
  select * into v_req from public.service_requests where id = p_id;
  if v_req.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if not (public.is_org_member(v_req.org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;
  if p_status not in ('done', 'dismissed') then raise exception 'bad_status'; end if;
  if v_req.status <> 'pending' then return jsonb_build_object('error', 'already_resolved'); end if;

  -- Ring up the sale only when fulfilling an order and a payment method is given.
  if p_status = 'done' and v_req.kind = 'order' and p_payment_method is not null then
    select jsonb_agg(jsonb_build_object('product_id', (it->>'product_id')::int, 'qty', (it->>'qty')::int))
      into v_items from jsonb_array_elements(v_req.items) it;
    v_sale := public.create_bar_sale(
      v_req.venue_id, p_payment_method, p_bank,
      coalesce(v_items, '[]'::jsonb), 'In-Seat #' || v_req.console_id, null);
  end if;

  update public.service_requests
    set status = p_status, resolved_at = now(), resolved_by = auth.uid(), sale_id = v_sale
    where id = p_id;

  return jsonb_build_object('ok', true, 'sale_id', v_sale);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — public RPCs to anon; the fulfil RPC to authenticated only.
-- ---------------------------------------------------------------------------
revoke all on function public.portal_get_menu(uuid)                       from public;
revoke all on function public.portal_get_session_status(int)              from public;
revoke all on function public.portal_place_order(uuid, int, jsonb)        from public;
revoke all on function public.portal_request_service(uuid, int, text)     from public;
revoke all on function public.resolve_service_request(uuid, text, text, text) from public, anon;

grant execute on function public.portal_get_menu(uuid)                   to anon, authenticated;
grant execute on function public.portal_get_session_status(int)          to anon, authenticated;
grant execute on function public.portal_place_order(uuid, int, jsonb)    to anon, authenticated;
grant execute on function public.portal_request_service(uuid, int, text) to anon, authenticated;
grant execute on function public.resolve_service_request(uuid, text, text, text) to authenticated;
