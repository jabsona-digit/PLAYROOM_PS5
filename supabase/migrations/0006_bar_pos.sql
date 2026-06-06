-- Bar POS backend. Catalog (categories/products) is org-level; sales are
-- venue-level. Reuses the exact same payment_method/bank enum as sessions so
-- accounting can later union session + bar revenue into one ledger.

create table public.bar_categories (
  id          serial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index bar_categories_org_id_idx on public.bar_categories(org_id);

create table public.bar_products (
  id          serial primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  category_id int references public.bar_categories(id) on delete set null,
  name        text not null,
  price       numeric(10,2) not null check (price >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index bar_products_org_id_idx      on public.bar_products(org_id);
create index bar_products_category_id_idx on public.bar_products(category_id);

create table public.bar_sales (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  venue_id       uuid not null references public.venues(id) on delete cascade,
  total          numeric(10,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'transfer')),
  bank           text check (bank in ('TBC', 'BOG')),
  customer_name  text,
  created_by     int references public.employees(id),
  created_at     timestamptz not null default now(),
  constraint bar_sales_bank_consistency check (
    (payment_method = 'cash' and bank is null) or
    (payment_method <> 'cash' and bank is not null)
  )
);
create index bar_sales_org_id_idx     on public.bar_sales(org_id);
create index bar_sales_venue_id_idx   on public.bar_sales(venue_id);
create index bar_sales_created_at_idx on public.bar_sales(created_at);

create table public.bar_sale_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  sale_id     uuid not null references public.bar_sales(id) on delete cascade,
  product_id  int references public.bar_products(id) on delete set null,
  name        text not null,              -- snapshot
  unit_price  numeric(10,2) not null,     -- snapshot
  qty         int not null check (qty > 0),
  line_total  numeric(10,2) not null,
  created_at  timestamptz not null default now()
);
create index bar_sale_items_sale_id_idx on public.bar_sale_items(sale_id);
create index bar_sale_items_org_id_idx  on public.bar_sale_items(org_id);

-- RLS: org-scoped like everything else
alter table public.bar_categories enable row level security;
alter table public.bar_products   enable row level security;
alter table public.bar_sales      enable row level security;
alter table public.bar_sale_items enable row level security;

create policy "org_scope" on public.bar_categories for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.bar_products for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.bar_sales for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());
create policy "org_scope" on public.bar_sale_items for all to authenticated
  using (is_org_member(org_id) or is_platform_admin())
  with check (is_org_member(org_id) or is_platform_admin());

revoke all on public.bar_categories from anon;
revoke all on public.bar_products   from anon;
revoke all on public.bar_sales      from anon;
revoke all on public.bar_sale_items from anon;

-- Atomic checkout: total computed server-side from current product prices.
-- p_items: jsonb array of { "product_id": int, "qty": int }.
create or replace function public.create_bar_sale(
  p_venue_id       uuid,
  p_payment_method text,
  p_bank           text default null,
  p_items          jsonb default '[]'::jsonb,
  p_customer_name  text default null,
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

  insert into public.bar_sales (org_id, venue_id, payment_method, bank, customer_name, created_by, total)
    values (v_org, p_venue_id, p_payment_method, v_bank, p_customer_name, p_created_by, 0)
    returning id into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'product_id')::int;
    v_qty := greatest(1, coalesce((v_item->>'qty')::int, 1));
    select name, price into v_name, v_price
      from public.bar_products where id = v_pid and org_id = v_org and is_active;
    if v_price is null then raise exception 'პროდუქტი ვერ მოიძებნა'; end if;
    insert into public.bar_sale_items (org_id, sale_id, product_id, name, unit_price, qty, line_total)
      values (v_org, v_sale, v_pid, v_name, v_price, v_qty, round(v_price * v_qty, 2));
    v_total := v_total + round(v_price * v_qty, 2);
  end loop;

  update public.bar_sales set total = v_total where id = v_sale;
  return v_sale;
end;
$$;

revoke all on function public.create_bar_sale(uuid, text, text, jsonb, text, int) from public, anon;
grant execute on function public.create_bar_sale(uuid, text, text, jsonb, text, int) to authenticated;

-- Seed a demo bar menu for the demo org
do $$
declare
  v_org    uuid;
  c_drinks int;
  c_chips  int;
  c_energy int;
  c_coffee int;
begin
  select id into v_org from public.organizations where slug = 'demo';
  if v_org is null then return; end if;

  insert into public.bar_categories (org_id, name, sort_order) values (v_org, 'სასმელები', 1) returning id into c_drinks;
  insert into public.bar_categories (org_id, name, sort_order) values (v_org, 'ჩიფსები', 2) returning id into c_chips;
  insert into public.bar_categories (org_id, name, sort_order) values (v_org, 'ენერგეტიკული', 3) returning id into c_energy;
  insert into public.bar_categories (org_id, name, sort_order) values (v_org, 'ყავა', 4) returning id into c_coffee;

  insert into public.bar_products (org_id, category_id, name, price) values
    (v_org, c_drinks, 'Coca-Cola 0.5', 3.00),
    (v_org, c_drinks, 'Fanta 0.5', 3.00),
    (v_org, c_drinks, 'წყალი 0.5', 1.50),
    (v_org, c_drinks, 'ნატურალური წვენი', 4.00),
    (v_org, c_chips, 'Lays კლასიკური', 2.50),
    (v_org, c_chips, 'Pringles', 5.00),
    (v_org, c_energy, 'Red Bull', 5.00),
    (v_org, c_energy, 'Hell', 3.50),
    (v_org, c_coffee, 'ესპრესო', 4.00),
    (v_org, c_coffee, 'კაპუჩინო', 5.00);
end $$;
