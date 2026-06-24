-- 0133 - Loyalty: a marketplace passport scan must NOT hard-fail when the player's marketplace
-- phone is missing or invalid. A marketplace customer is uniquely identified by
-- marketplace_customer_id, so the phone is OPTIONAL for them; walk-ins still need a valid phone
-- (for dedup). Real bug: antigravity1985geo registered with an 8-digit phone ("55777667") ->
-- link_marketplace_customer raised invalid_phone -> passport scan had "no reaction" at session
-- start. Booking/portal QR scanning was fine (proves the html5-qrcode scanner itself works).

-- 1) validate_customer: if a phone is given it must be a valid Georgian mobile; an EMPTY phone is
--    allowed ONLY for marketplace-linked customers (identity = the marketplace link).
create or replace function public.validate_customer()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_phone text;
begin
  if coalesce(btrim(new.name), '') = '' then
    raise exception 'customer_name_required';
  end if;
  v_phone := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');                                  -- digits only
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;    -- drop +995
  if tg_op = 'INSERT' or new.phone is distinct from old.phone then
    if v_phone <> '' then
      if length(v_phone) <> 9 or left(v_phone, 1) <> '5' then
        raise exception 'invalid_phone';            -- a provided phone must be a 9-digit GE mobile
      end if;
    elsif new.marketplace_customer_id is null then
      raise exception 'invalid_phone';              -- walk-ins must provide a phone; marketplace-linked may omit it
    end if;
  end if;
  new.phone := nullif(v_phone, '');
  return new;
end; $function$;

-- 2) link_marketplace_customer: never hard-fail on a bad marketplace phone — create the local
--    customer with the phone if it's valid, otherwise NULL (validate_customer now allows that
--    for marketplace-linked rows). Everything else unchanged from 0130.
create or replace function public.link_marketplace_customer(p_org uuid, p_marketplace_id uuid)
returns customers language plpgsql security definer set search_path to 'public' as $function$
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

  -- 3) create a new local customer — phone only if the marketplace profile has a valid one,
  --    else NULL (identity is the marketplace link, not the phone).
  insert into public.customers (org_id, name, phone, marketplace_customer_id)
    values (p_org, coalesce(nullif(btrim(v_mc.full_name), ''), 'Marketplace'),
            case when length(v_phone) = 9 and left(v_phone, 1) = '5' then v_phone else null end,
            p_marketplace_id)
    returning * into v_cust;
  return v_cust;
end; $function$;
