-- 0139 - Tenant contact info + bank-transfer reference code (platform billing UX).
-- Owner asks (2026-06-25): (1) a per-venue REFERENCE CODE the tenant puts in the bank
-- transfer description so the platform owner can tell who paid; (2) show the tenant's
-- registered EMAIL in God Mode; (3) make the tenant's PHONE mandatory at signup so the
-- platform always has contact info. Email is auto-captured from the signup auth user;
-- phone is a required onboarding field; billing_ref is a human-readable serial (MTL0001…).

-- ── 1) columns on organizations ──────────────────────────────────────────────
alter table public.organizations add column if not exists contact_phone text;
alter table public.organizations add column if not exists contact_email text;
alter table public.organizations add column if not exists billing_ref   text;

-- human-readable, guaranteed-unique transfer reference (MTL0001, MTL0002, …)
create sequence if not exists public.billing_ref_seq start 1;
create or replace function public.next_billing_ref()
returns text language sql volatile set search_path = public as $$
  select 'MTL' || lpad(nextval('public.billing_ref_seq')::text, 4, '0');
$$;
revoke all on function public.next_billing_ref() from public, anon, authenticated;

-- ── 2) backfill existing orgs: ref (in created order) + email (owner's auth email) ──
do $$
declare r record;
begin
  for r in select id from public.organizations where billing_ref is null order by created_at loop
    update public.organizations set billing_ref = public.next_billing_ref() where id = r.id;
  end loop;
end $$;

update public.organizations o
   set contact_email = u.email
  from public.org_members m
  join auth.users u on u.id = m.user_id
 where m.org_id = o.id and m.role = 'owner' and o.contact_email is null;

-- enforce uniqueness once backfilled
create unique index if not exists organizations_billing_ref_key on public.organizations(billing_ref);

-- ── 3) create_organization v2: + required p_contact_phone, auto email + ref ──────
create or replace function public.create_organization(
  p_org_name text,
  p_venue_name text,
  p_identification_code text default null,
  p_contact_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_email text;
  v_phone text;
begin
  if v_uid is null then raise exception 'ავტორიზაცია საჭიროა'; end if;
  if coalesce(trim(p_org_name), '') = '' then raise exception 'ორგანიზაციის სახელი სავალდებულოა'; end if;

  -- phone is mandatory now: normalize to a 9-digit Georgian mobile (5XXXXXXXX)
  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;
  if length(v_phone) <> 9 or left(v_phone, 1) <> '5' then
    raise exception 'მიუთითე სწორი ტელეფონის ნომერი (9 ციფრი, იწყება 5-ით)';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.organizations (name, identification_code, contact_phone, contact_email, billing_ref)
    values (trim(p_org_name), nullif(trim(p_identification_code), ''), v_phone, v_email, public.next_billing_ref())
    returning id into v_org;
  insert into public.venues (org_id, name)
    values (v_org, coalesce(nullif(trim(p_venue_name), ''), 'მთავარი ფილიალი'));
  insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour) values
    (v_org, 'სტანდარტი', 'standard', 2, 5.00),
    (v_org, 'Pro',        'pro',      3, 7.00),
    (v_org, 'პრემიუმი',  'premium',  4, 8.00);
  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text) to authenticated;

-- ── 4) set_org_contact: platform admin edits contact info (fills legacy tenants) ──
create or replace function public.set_org_contact(p_org uuid, p_phone text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  if not is_platform_admin() then raise exception 'unauthorized'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) = 12 and left(v_phone, 3) = '995' then v_phone := substr(v_phone, 4); end if;
  if p_phone is not null and p_phone <> '' and (length(v_phone) <> 9 or left(v_phone, 1) <> '5') then
    raise exception 'ტელეფონის ნომერი არასწორია';
  end if;
  update public.organizations
     set contact_phone = nullif(v_phone, ''),
         contact_email = nullif(trim(p_email), '')
   where id = p_org;
end;
$$;
revoke all on function public.set_org_contact(uuid, text, text) from public, anon;
grant execute on function public.set_org_contact(uuid, text, text) to authenticated;

-- ── 5) God-Mode overview += contact + ref ────────────────────────────────────
drop view if exists public.platform_org_overview;
create view public.platform_org_overview with (security_invoker = true) as
select
  o.id, o.name, o.plan, o.subscription_status, o.trial_ends_at, o.current_period_end,
  o.contact_phone, o.contact_email, o.billing_ref,
  public.plan_monthly_price(o.plan)                                as monthly_amount,
  o.created_at,
  (select count(*) from public.org_members m where m.org_id = o.id) as member_count,
  (select count(*) from public.venues v where v.org_id = o.id)      as venue_count,
  coalesce((select sum(s.price_total) from public.sessions s
              where s.org_id = o.id and s.status = 'completed'), 0)
  + coalesce((select sum(b.total) from public.bar_sales b where b.org_id = o.id), 0)
                                                                   as total_revenue,
  (select max(p.paid_at) from public.platform_payments p where p.org_id = o.id) as last_payment_at,
  coalesce((select sum(p.amount) from public.platform_payments p where p.org_id = o.id), 0)
                                                                   as total_paid
from public.organizations o
order by o.created_at desc;

grant select on public.platform_org_overview to authenticated;
