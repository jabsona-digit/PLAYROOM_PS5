-- 0058 Per-tenant payment credentials (BYO merchant — Phase 1: the "slot")
-- Each owner connects THEIR OWN TBC/BOG merchant account so their customers'
-- online payments land in the OWNER's bank — the platform never custodies funds
-- (no aggregator licence). This migration is only the secure STORAGE + admin
-- RPCs; the live checkout/callback (Phase 2) is built on top later.
--
-- Security model:
-- - The actual secret(s) live in **Supabase Vault** (encrypted at rest), never in
--   a plaintext column and never returned to the browser.
-- - The table itself has RLS ON with NO authenticated policies and NO grants:
--   the ONLY door is the SECURITY DEFINER RPCs below, which gate on is_org_admin.
-- - Reads return non-secret metadata only (provider / merchant id / status).

create table public.org_payment_credentials (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  provider       text not null check (provider in ('tbc','bog')),
  merchant_id    text,                 -- non-secret identifier (client/merchant id), shown to the owner
  secret_ref     uuid,                 -- vault.secrets id → JSON bundle of the secret field(s)
  is_active      boolean not null default true,
  status         text not null default 'configured' check (status in ('configured','verified','error')),
  last_tested_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, provider)
);
create index org_payment_credentials_org_idx on public.org_payment_credentials(org_id);

-- Total lockdown: RLS on, zero policies/grants for authenticated/anon. All access
-- flows through the definer RPCs below.
alter table public.org_payment_credentials enable row level security;
revoke all on public.org_payment_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_payment_credentials — owner/admin upserts a provider's creds.
-- p_secret: jsonb bundle, e.g. {"client_secret":"...","api_key":"..."} (provider-
-- specific). Stored encrypted in Vault; merchant_id kept plain for display.
-- ---------------------------------------------------------------------------
create or replace function public.save_payment_credentials(
  p_org_id      uuid,
  p_provider    text,
  p_merchant_id text,
  p_secret      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref  uuid;
  v_name text;
begin
  if p_provider not in ('tbc','bog') then
    return jsonb_build_object('error','bad_provider');
  end if;
  if not (public.is_org_admin(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  select secret_ref into v_ref
    from public.org_payment_credentials
    where org_id = p_org_id and provider = p_provider;

  if v_ref is not null then
    -- rotate the existing Vault secret in place
    perform vault.update_secret(v_ref, coalesce(p_secret, '{}'::jsonb)::text);
    update public.org_payment_credentials
      set merchant_id = p_merchant_id,
          status      = 'configured',
          is_active   = true,
          updated_at  = now()
      where org_id = p_org_id and provider = p_provider;
  else
    v_name := 'mlpay_' || p_org_id || '_' || p_provider || '_' || substr(gen_random_uuid()::text, 1, 8);
    v_ref  := vault.create_secret(coalesce(p_secret, '{}'::jsonb)::text, v_name, 'Martelounge payment credentials');
    insert into public.org_payment_credentials (org_id, provider, merchant_id, secret_ref, status)
      values (p_org_id, p_provider, p_merchant_id, v_ref, 'configured');
  end if;

  -- NEVER log the secret — metadata only.
  perform public.log_audit(p_org_id, null, 'payment_credentials.save', 'payment', p_provider, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_payment_settings — non-secret status for the owner's Settings UI.
-- ---------------------------------------------------------------------------
create or replace function public.get_payment_settings(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_org_admin(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'provider',       c.provider,
             'merchant_id',    c.merchant_id,
             'is_active',      c.is_active,
             'status',         c.status,
             'last_tested_at', c.last_tested_at,
             'configured',     true)
           order by c.provider)
    from public.org_payment_credentials c
    where c.org_id = p_org_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_payment_provider_active — toggle a provider on/off.
-- ---------------------------------------------------------------------------
create or replace function public.set_payment_provider_active(
  p_org_id   uuid,
  p_provider text,
  p_active   boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_org_admin(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;
  update public.org_payment_credentials
    set is_active = p_active, updated_at = now()
    where org_id = p_org_id and provider = p_provider;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_payment_credentials — disconnect a provider (drops the Vault secret).
-- ---------------------------------------------------------------------------
create or replace function public.delete_payment_credentials(
  p_org_id   uuid,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref uuid;
begin
  if not (public.is_org_admin(p_org_id) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  select secret_ref into v_ref
    from public.org_payment_credentials
    where org_id = p_org_id and provider = p_provider;

  delete from public.org_payment_credentials
    where org_id = p_org_id and provider = p_provider;
  if v_ref is not null then
    delete from vault.secrets where id = v_ref;
  end if;

  perform public.log_audit(p_org_id, null, 'payment_credentials.delete', 'payment', p_provider, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Grants: authenticated only (RPCs self-gate on is_org_admin); anon never.
revoke all on function public.save_payment_credentials(uuid, text, text, jsonb)   from public, anon;
revoke all on function public.get_payment_settings(uuid)                          from public, anon;
revoke all on function public.set_payment_provider_active(uuid, text, boolean)     from public, anon;
revoke all on function public.delete_payment_credentials(uuid, text)              from public, anon;

grant execute on function public.save_payment_credentials(uuid, text, text, jsonb) to authenticated;
grant execute on function public.get_payment_settings(uuid)                        to authenticated;
grant execute on function public.set_payment_provider_active(uuid, text, boolean)  to authenticated;
grant execute on function public.delete_payment_credentials(uuid, text)            to authenticated;
