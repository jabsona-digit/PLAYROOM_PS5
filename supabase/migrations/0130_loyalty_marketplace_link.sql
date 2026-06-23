-- 0130 - Loyalty Phase B: link a marketplace customer (online Gamer Passport) to a venue's
-- LOCAL customer by phone, so the passport QR works at the desk and points unify. A marketplace
-- account is global; a local customer is per-org -> the link is one (marketplace) to many (local,
-- one per org the person visits).

alter table public.customers add column if not exists marketplace_customer_id uuid;
do $$ begin
  alter table public.customers add constraint customers_marketplace_fk
    foreign key (marketplace_customer_id) references public.marketplace_customers(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists customers_marketplace_idx on public.customers(marketplace_customer_id)
  where marketplace_customer_id is not null;

-- link_marketplace_customer: the operator's session-start scanner calls this when a passport
-- QR (MTLM:<marketplace_id>) is scanned. Finds-or-creates a LOCAL customer in the caller's org
-- by the marketplace customer's phone, links it, returns it. Org-member gated.
create or replace function public.link_marketplace_customer(p_org uuid, p_marketplace_id uuid)
returns public.customers
language plpgsql security definer set search_path = public as $$
declare v_mc record; v_cust public.customers; v_phone text;
begin
  if not public.is_org_member(p_org) then raise exception 'insufficient_privilege'; end if;
  select id, full_name, phone into v_mc from public.marketplace_customers where id = p_marketplace_id;
  if v_mc.id is null then raise exception 'marketplace_customer_not_found'; end if;
  v_phone := regexp_replace(coalesce(v_mc.phone, ''), '\D', '', 'g');
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;

  -- 1) already linked in this org?
  select * into v_cust from public.customers
    where org_id = p_org and marketplace_customer_id = p_marketplace_id limit 1;
  if v_cust.id is not null then return v_cust; end if;

  -- 2) match an existing local customer by phone in this org -> link it
  if length(v_phone) = 9 then
    select * into v_cust from public.customers
      where org_id = p_org and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone limit 1;
    if v_cust.id is not null then
      update public.customers set marketplace_customer_id = p_marketplace_id
        where id = v_cust.id returning * into v_cust;
      return v_cust;
    end if;
  end if;

  -- 3) create a new local customer (validate_customer 0129 needs a valid phone)
  if length(v_phone) <> 9 or left(v_phone, 1) <> '5' then raise exception 'invalid_phone'; end if;
  insert into public.customers (org_id, name, phone, marketplace_customer_id)
    values (p_org, coalesce(nullif(btrim(v_mc.full_name), ''), 'Marketplace'), v_phone, p_marketplace_id)
    returning * into v_cust;
  return v_cust;
end; $$;
revoke all on function public.link_marketplace_customer(uuid, uuid) from public, anon;
grant execute on function public.link_marketplace_customer(uuid, uuid) to authenticated;
