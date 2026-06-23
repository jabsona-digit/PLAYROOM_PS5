-- 0131 - Referral program Phase 1 (viral core + owner control). play.martelounge.ge:
-- every player has a referral_code + share link; whoever registers via it and PLAYS earns
-- the REFERRER 3% of the referee's session spend as a PLATFORM-FUNDED reward (1 point = GEL1),
-- in a SEPARATE referral wallet (an append-only ledger), NOT venue loyalty. Owner sees all in
-- God Mode. Redemption + platform<->venue settlement = Phase 2. See memory/referral-system.md.

-- 1) marketplace_customers: referral_code (shareable, unique) + referred_by (set once, no self-ref)
alter table public.marketplace_customers add column if not exists referral_code text;
update public.marketplace_customers
  set referral_code = upper(substr(translate(gen_random_uuid()::text, '-', ''), 1, 8))
  where referral_code is null;
alter table public.marketplace_customers
  alter column referral_code set default upper(substr(translate(gen_random_uuid()::text, '-', ''), 1, 8));
create unique index if not exists marketplace_customers_refcode_idx on public.marketplace_customers(referral_code);

alter table public.marketplace_customers add column if not exists referred_by uuid references public.marketplace_customers(id);
do $$ begin
  alter table public.marketplace_customers add constraint mc_no_self_ref check (referred_by is null or referred_by <> id);
exception when duplicate_object then null; end $$;

-- 2) referral_earnings — append-only ledger (the referral wallet = SUM here - redemptions later).
--    One earning per session (unique session_id) => idempotent.
create table if not exists public.referral_earnings (
  id          bigint generated always as identity primary key,
  referrer_id uuid not null references public.marketplace_customers(id) on delete cascade,
  referee_id  uuid not null references public.marketplace_customers(id) on delete cascade,
  session_id  uuid unique references public.sessions(id) on delete cascade,
  org_id      uuid,
  amount      numeric(10,2) not null default 0,   -- 3% of session spend, in GEL (= points)
  created_at  timestamptz not null default now()
);
create index if not exists referral_earnings_referrer_idx on public.referral_earnings(referrer_id, created_at desc);
alter table public.referral_earnings enable row level security;
revoke all on public.referral_earnings from anon, authenticated;
-- referrer reads their own; platform admin (God Mode) reads all. Inserts only via the trigger below.
drop policy if exists ref_earn_select on public.referral_earnings;
create policy ref_earn_select on public.referral_earnings for select to authenticated
  using (referrer_id = auth.uid() or public.is_platform_admin());

-- 3) accrual: on a session's not-completed -> completed transition, if the (identified) referee
--    was referred, credit the referrer 3% of price_total. SESSION-only; platform-funded.
create or replace function public.accrue_referral_earning()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_referee uuid; v_referrer uuid;
begin
  if new.customer_id is not null and new.status = 'completed' and old.status is distinct from 'completed' then
    select mc.id, mc.referred_by into v_referee, v_referrer
      from public.customers c
      join public.marketplace_customers mc on mc.id = c.marketplace_customer_id
      where c.id = new.customer_id;
    if v_referrer is not null and v_referrer <> v_referee then
      insert into public.referral_earnings (referrer_id, referee_id, session_id, org_id, amount)
        values (v_referrer, v_referee, new.id, new.org_id, round(coalesce(new.price_total, 0) * 0.03, 2))
        on conflict (session_id) do nothing;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_accrue_referral on public.sessions;
create trigger trg_accrue_referral after update on public.sessions
  for each row execute function public.accrue_referral_earning();

-- 4) claim_referral(code): called by the marketplace register flow (client reads ?ref from
--    localStorage). Ensures the caller's marketplace_customers row exists, then sets referred_by
--    ONCE (immutable, no self-ref). SECURITY DEFINER (touches auth.users + bypasses own-row RLS).
create or replace function public.claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid(); v_ref uuid; v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into v_ref from public.marketplace_customers where referral_code = upper(btrim(p_code));
  if v_ref is null then return jsonb_build_object('ok', false, 'error', 'invalid_code'); end if;
  if v_ref = v_uid then return jsonb_build_object('ok', false, 'error', 'self_referral'); end if;
  -- ensure a row for the caller (full_name is NOT NULL -> fall back to metadata/email)
  insert into public.marketplace_customers (id, full_name)
    select v_uid, coalesce(
      (select raw_user_meta_data->>'full_name' from auth.users where id = v_uid),
      (select email from auth.users where id = v_uid), 'Player')
    on conflict (id) do nothing;
  select referred_by into v_existing from public.marketplace_customers where id = v_uid;
  if v_existing is not null then return jsonb_build_object('ok', false, 'error', 'already_referred'); end if;
  update public.marketplace_customers set referred_by = v_ref where id = v_uid;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- 5) get_my_referral(): the referrer's own share data for /account.
create or replace function public.get_my_referral()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'code', (select referral_code from public.marketplace_customers where id = v_uid),
    'referred_count', (select count(*) from public.marketplace_customers where referred_by = v_uid),
    'total_earned', coalesce((select sum(amount) from public.referral_earnings where referrer_id = v_uid), 0)
  );
end; $$;
revoke all on function public.get_my_referral() from public, anon;
grant execute on function public.get_my_referral() to authenticated;

-- 6) get_referral_overview(days): God-Mode control panel (platform admin only).
create or replace function public.get_referral_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'referred_total', (select count(*) from public.marketplace_customers where referred_by is not null),
    'earned_total',   coalesce((select sum(amount) from public.referral_earnings), 0),
    'earned_period',  coalesce((select sum(amount) from public.referral_earnings where created_at >= now() - make_interval(days => p_days)), 0),
    'top_referrers', coalesce((
      select jsonb_agg(x) from (
        select r.referrer_id, mc.full_name, mc.referral_code,
               count(*) as earns, sum(r.amount) as earned,
               (select count(*) from public.marketplace_customers m where m.referred_by = r.referrer_id) as referred
        from public.referral_earnings r
        join public.marketplace_customers mc on mc.id = r.referrer_id
        group by r.referrer_id, mc.full_name, mc.referral_code
        order by sum(r.amount) desc limit 20
      ) x), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(y) from (
        select r.amount, r.created_at,
               rf.full_name as referrer, re.full_name as referee
        from public.referral_earnings r
        join public.marketplace_customers rf on rf.id = r.referrer_id
        join public.marketplace_customers re on re.id = r.referee_id
        order by r.created_at desc limit 30
      ) y), '[]'::jsonb)
  );
end; $$;
revoke all on function public.get_referral_overview(int) from public, anon;
grant execute on function public.get_referral_overview(int) to authenticated;
