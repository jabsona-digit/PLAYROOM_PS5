-- Inventory, menu management, customer loyalty, and POS↔session attach.
-- Requested by the frontend (Gemini): subcategories, stock/cost tracking,
-- barcode scanning, product images, customer loyalty, attach bar sale to a session.

-- 1. Subcategories
alter table public.bar_categories
  add column parent_id int references public.bar_categories(id) on delete set null;

-- 2. Inventory + profit fields on products
alter table public.bar_products
  add column barcode             text,
  add column image_url           text,
  add column stock_quantity      int not null default 0,
  add column low_stock_threshold int not null default 5,
  add column cost_price          numeric(10,2) not null default 0 check (cost_price >= 0);

-- a barcode resolves to one product per org (used by the scanner)
create unique index bar_products_org_barcode_uniq
  on public.bar_products(org_id, barcode) where barcode is not null;

-- 3. Cost snapshot on sale lines (for accurate profit later)
alter table public.bar_sale_items
  add column unit_cost_price numeric(10,2) not null default 0;

-- 4. Attach a bar sale to an open session (room tab)
alter table public.bar_sales
  add column session_id uuid references public.sessions(id) on delete set null;
create index bar_sales_session_id_idx on public.bar_sales(session_id);

-- 5. Customers / loyalty
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  phone        text,
  points       int not null default 0,
  discount_pct numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  total_spent  numeric(12,2) not null default 0,
  visit_count  int not null default 0,
  created_at   timestamptz not null default now()
);
create index customers_org_id_idx on public.customers(org_id);

alter table public.customers enable row level security;
create policy "org_scope" on public.customers for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
revoke all on public.customers from anon;

-- 6. create_bar_sale: now snapshots unit_cost_price, deducts stock, links a session.
drop function if exists public.create_bar_sale(uuid, text, text, jsonb, text, int);
create or replace function public.create_bar_sale(
  p_venue_id       uuid,
  p_payment_method text,
  p_bank           text default null,
  p_items          jsonb default '[]'::jsonb,
  p_customer_name  text default null,
  p_session_id     uuid default null,
  p_created_by     int default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org   uuid;
  v_bank  text := p_bank;
  v_sale  uuid;
  v_total numeric(10,2) := 0;
  v_item  jsonb;
  v_pid   int;
  v_qty   int;
  v_price numeric(10,2);
  v_cost  numeric(10,2);
  v_name  text;
begin
  if p_payment_method not in ('cash', 'card', 'transfer') then
    raise exception 'გადახდის მეთოდი არასწორია';
  end if;
  if p_payment_method = 'cash' then
    v_bank := null;
  elsif v_bank is null or v_bank not in ('TBC', 'BOG') then
    raise exception 'მიუთითე ბანკი (TBC ან BOG)';
  end if;

  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'წვდომა აკრძალულია';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'კალათა ცარიელია';
  end if;
  -- if a session is referenced, it must belong to this org
  if p_session_id is not null
     and not exists (select 1 from public.sessions where id = p_session_id and org_id = v_org) then
    raise exception 'სესია ვერ მოიძებნა';
  end if;

  insert into public.bar_sales (org_id, venue_id, payment_method, bank, customer_name, session_id, created_by, total)
    values (v_org, p_venue_id, p_payment_method, v_bank, p_customer_name, p_session_id, p_created_by, 0)
    returning id into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::int;
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select name, price, cost_price into v_name, v_price, v_cost
      from public.bar_products where id = v_pid and org_id = v_org and is_active;
    if v_price is null then raise exception 'პროდუქტი ვერ მოიძებნა'; end if;

    insert into public.bar_sale_items (org_id, sale_id, product_id, name, unit_price, unit_cost_price, qty, line_total)
      values (v_org, v_sale, v_pid, v_name, v_price, coalesce(v_cost, 0), v_qty, round(v_price * v_qty, 2));

    -- deduct inventory
    update public.bar_products
       set stock_quantity = stock_quantity - v_qty
     where id = v_pid;

    v_total := v_total + round(v_price * v_qty, 2);
  end loop;

  update public.bar_sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;

revoke all on function public.create_bar_sale(uuid, text, text, jsonb, text, uuid, int) from public, anon;
grant execute on function public.create_bar_sale(uuid, text, text, jsonb, text, uuid, int) to authenticated;
