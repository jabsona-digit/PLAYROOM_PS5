-- 0146 - BANK PAYMENTS ENGINE (TBC/BOG online checkout — Phase 2 core, mock-ready).
-- Mirrors the proven crypto engine (0143): create → ledger row → bank webhook →
-- verify → idempotent fulfill. Pairs with the `bank-pay` edge function (deployed
-- --no-verify-jwt so bank callbacks reach it). Credentials come from 0058's
-- per-org Vault storage (org_payment_credentials.secret_ref).
--
-- Mock mode is gated by organizations.bank_test_mode (default FALSE): a booking
-- can only be "mock-paid" (no real money) when the org explicitly opted into
-- test mode — otherwise an org without credentials simply can't take online
-- card payments (prevents fake-paid bookings on real venues).

-- ── ledger ─────────────────────────────────────────────────────────────────────
create table public.bank_payments (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('bog','tbc','mock')),
  external_id  text unique,                       -- bank's order/payment id (null for mock until stamped)
  order_type   text not null default 'booking' check (order_type in ('booking')),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  venue_id     uuid references public.venues(id) on delete set null,
  booking_id   uuid not null references public.marketplace_bookings(id) on delete cascade,
  amount       numeric(10,2) not null check (amount > 0),
  currency     text not null default 'GEL',
  status       text not null default 'pending'
               check (status in ('pending','paid','failed','expired','refunded')),
  is_mock      boolean not null default false,
  redirect_url text,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  fulfilled_at timestamptz
);
create index bank_payments_org_idx     on public.bank_payments(org_id);
create index bank_payments_booking_idx on public.bank_payments(booking_id);

-- Org members may READ their own rows (owner sees payment history); all writes
-- go through the service role (edge fn) only.
alter table public.bank_payments enable row level security;
create policy bank_payments_org_read on public.bank_payments
  for select to authenticated using (public.is_org_member(org_id));
revoke all on public.bank_payments from anon;
grant select on public.bank_payments to authenticated;

-- ── mock gate ──────────────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists bank_test_mode boolean not null default false;

-- ── credentials reader (edge fn only) ─────────────────────────────────────────
-- Returns merchant_id + the DECRYPTED Vault secret bundle for an org's provider.
-- service_role ONLY — this is the single seam where secrets leave the Vault.
create or replace function public.get_bank_credentials(p_org uuid, p_provider text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_row    public.org_payment_credentials;
  v_secret text;
begin
  select * into v_row
    from public.org_payment_credentials
    where org_id = p_org and provider = p_provider and is_active;
  if not found then return jsonb_build_object('error', 'not_configured'); end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where id = v_row.secret_ref;

  return jsonb_build_object(
    'ok', true,
    'provider', v_row.provider,
    'merchant_id', v_row.merchant_id,
    'secret', coalesce(v_secret, '{}')::jsonb
  );
end;
$$;
revoke all on function public.get_bank_credentials(uuid, text) from public, anon, authenticated;

-- ── idempotent fulfillment (edge fn only; the verified callback is the authority)
create or replace function public.bank_fulfill_booking(p_payment_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_pay public.bank_payments;
begin
  select * into v_pay from public.bank_payments where id = p_payment_id;
  if not found then return jsonb_build_object('error', 'payment_not_found'); end if;
  if v_pay.fulfilled_at is not null then
    return jsonb_build_object('ok', true, 'already_fulfilled', true);
  end if;

  update public.bank_payments
     set status = 'paid', fulfilled_at = now(), updated_at = now()
   where id = p_payment_id and fulfilled_at is null;
  if not found then return jsonb_build_object('ok', true, 'already_fulfilled', true); end if;

  update public.marketplace_bookings
     set payment_status = 'paid',
         payment_method = 'card',
         payment_ref    = coalesce(v_pay.external_id, 'mock:' || v_pay.id::text),
         paid_at        = now(),
         status         = case when status = 'pending' then 'confirmed' else status end,
         updated_at     = now()
   where id = v_pay.booking_id
     and payment_status is distinct from 'paid';

  perform public.log_audit(v_pay.org_id, v_pay.venue_id,
    'booking.bank_paid', 'marketplace_booking', v_pay.booking_id::text,
    jsonb_build_object('provider', v_pay.provider, 'amount', v_pay.amount,
                       'external_id', v_pay.external_id, 'mock', v_pay.is_mock));

  return jsonb_build_object('ok', true, 'booking_id', v_pay.booking_id, 'mock', v_pay.is_mock);
end;
$$;
revoke all on function public.bank_fulfill_booking(uuid) from public, anon, authenticated;
