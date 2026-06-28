-- 0143 - Crypto payments engine (NOWPayments) — Phase 1: platform SUBSCRIPTION self-pay.
-- Owner call (2026-06-28): crypto is actively used in Georgia; being an early mover with a
-- WORKING crypto checkout is worth it (additive, low downside). TBC/BOG bank merchant
-- approval is slow; a NOWPayments account + API/IPN keys are instant. This is the reusable
-- ENGINE (order_type covers subscription/booking/tournament) wired first to the venue's own
-- subscription (the owner can E2E-test it himself). NOWPayments does NOT support GEL → the
-- edge fn prices in USD (price_usd) and stores the GEL value too. Fulfillment is driven by
-- the IPN webhook (HMAC-SHA512 verified in the edge fn), idempotent via np_payment_id.

-- platform_payments.method gains 'crypto' (was cash/card/transfer) for honest accounting.
alter table public.platform_payments drop constraint if exists platform_payments_method_check;
alter table public.platform_payments add constraint platform_payments_method_check
  check (method in ('cash', 'card', 'transfer', 'crypto'));

-- the crypto payment ledger — one row per NOWPayments payment, idempotency via np_payment_id.
create table if not exists public.crypto_payments (
  id            uuid primary key default gen_random_uuid(),
  np_payment_id text unique,                       -- NOWPayments payment id (idempotency key)
  order_type    text not null check (order_type in ('subscription', 'booking', 'tournament')),
  org_id        uuid references public.organizations(id) on delete set null,
  venue_id      uuid references public.venues(id) on delete set null,
  reference     text,                              -- the order_id we send to NOWPayments
  months        int,                               -- subscription: months purchased
  price_amount  numeric(12,2) not null default 0,  -- GEL value of the order
  price_usd     numeric(12,2),                     -- USD amount sent to NOWPayments
  pay_currency  text,                              -- btc / ltc / …
  pay_amount    numeric,                           -- expected crypto amount
  pay_address   text,                              -- deposit address
  status        text not null default 'waiting',   -- NOWPayments payment_status
  fulfilled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crypto_payments_org_idx on public.crypto_payments(org_id);

alter table public.crypto_payments enable row level security;
-- members see their own org's payments (status polling); platform admin sees all. NO write
-- policy → all writes go through the service-role edge fn / the definer RPC below.
drop policy if exists cp_read on public.crypto_payments;
create policy cp_read on public.crypto_payments for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
revoke all on public.crypto_payments from anon;

-- crypto_fulfill_subscription — called by the crypto-pay edge fn (service role) AFTER it has
-- HMAC-verified the IPN. Idempotent (fulfilled_at guard + np_payment_id unique). Extends the
-- org's paid period exactly like mark_tenant_paid, but with no is_platform_admin gate (the
-- verified IPN is the authority). NOT granted to anon/authenticated — service_role only.
create or replace function public.crypto_fulfill_subscription(p_np_payment_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cp public.crypto_payments; v_plan text; v_start timestamptz; v_end timestamptz;
begin
  select * into v_cp from public.crypto_payments where np_payment_id = p_np_payment_id for update;
  if v_cp.id is null then return jsonb_build_object('error', 'payment_not_found'); end if;
  if v_cp.order_type <> 'subscription' then return jsonb_build_object('error', 'not_subscription'); end if;
  if v_cp.org_id is null then return jsonb_build_object('error', 'no_org'); end if;
  if v_cp.fulfilled_at is not null then
    return jsonb_build_object('ok', true, 'already', true);   -- idempotent: IPN may fire repeatedly
  end if;

  select plan, greatest(coalesce(current_period_end, now()), now())
    into v_plan, v_start from public.organizations where id = v_cp.org_id for update;
  v_end := v_start + make_interval(months => coalesce(v_cp.months, 1));

  insert into public.platform_payments (org_id, amount, months, plan, period_start, period_end, method, note)
    values (v_cp.org_id, v_cp.price_amount, coalesce(v_cp.months, 1), v_plan, v_start, v_end, 'crypto',
            'Crypto (' || coalesce(v_cp.pay_currency, '?') || ') · NOWPayments ' || p_np_payment_id);
  update public.organizations set current_period_end = v_end, subscription_status = 'active'
    where id = v_cp.org_id;
  update public.crypto_payments set status = 'finished', fulfilled_at = now(), updated_at = now()
    where id = v_cp.id;

  return jsonb_build_object('ok', true, 'org', v_cp.org_id, 'period_end', v_end, 'months', coalesce(v_cp.months, 1));
end; $$;
revoke all on function public.crypto_fulfill_subscription(text) from public, anon, authenticated;
