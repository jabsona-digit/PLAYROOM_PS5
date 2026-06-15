-- 0065 Hardware cloud credentials (Shelly Cloud) — Vault-backed, per venue.
--
-- For control_mode='cloud' the device is reached through the vendor's cloud
-- (cloud→cloud, so a Supabase edge function CAN call it — unlike a LAN relay).
-- Shelly Cloud needs a `server` host + a secret `auth_key`. The key is stored in
-- Supabase Vault and is NEVER returned to the client: members only see status,
-- admins save it, and ONLY the service-role edge function can read it back.

create table public.hardware_credentials (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  venue_id    uuid not null references public.venues(id)        on delete cascade,
  provider    text not null check (provider in ('shelly', 'tuya')),
  server      text,                 -- e.g. shelly-123-eu.shelly.cloud (non-secret)
  secret_ref  uuid,                 -- vault.secrets id → { "auth_key": "..." }
  created_at  timestamptz not null default now(),
  unique (venue_id, provider)
);

alter table public.hardware_credentials enable row level security;
create policy "hwcred_member_read" on public.hardware_credentials for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy "hwcred_admin_write" on public.hardware_credentials for all to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin())
  with check (public.is_org_admin(org_id) or public.is_platform_admin());
revoke all on public.hardware_credentials from anon;

-- ---------------------------------------------------------------------------
-- save: admin upserts the cloud account (server + auth_key → Vault)
-- ---------------------------------------------------------------------------
create or replace function public.save_hardware_credentials(
  p_venue_id  uuid,
  p_provider  text,
  p_server    text,
  p_auth_key  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_ref uuid;
  v_name text;
begin
  if p_provider not in ('shelly', 'tuya') then raise exception 'bad_provider'; end if;
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then raise exception 'venue_not_found'; end if;
  if not (public.is_org_admin(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;

  select secret_ref into v_ref from public.hardware_credentials where venue_id = p_venue_id and provider = p_provider;

  if p_auth_key is not null and length(trim(p_auth_key)) > 0 then
    if v_ref is not null then
      perform vault.update_secret(v_ref, jsonb_build_object('auth_key', p_auth_key)::text);
    else
      v_name := 'hw_' || p_provider || '_' || p_venue_id::text;
      v_ref  := vault.create_secret(jsonb_build_object('auth_key', p_auth_key)::text, v_name, 'Martelounge hardware cloud credentials');
    end if;
  end if;

  insert into public.hardware_credentials (org_id, venue_id, provider, server, secret_ref)
    values (v_org, p_venue_id, p_provider, nullif(trim(p_server), ''), v_ref)
  on conflict (venue_id, provider) do update
    set server = excluded.server,
        secret_ref = coalesce(excluded.secret_ref, public.hardware_credentials.secret_ref);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- settings: non-secret status for the Settings UI (member)
-- ---------------------------------------------------------------------------
create or replace function public.get_hardware_settings(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_out jsonb;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then return jsonb_build_object('error', 'venue_not_found'); end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'provider', provider, 'server', server, 'configured', secret_ref is not null)), '[]'::jsonb)
    into v_out
    from public.hardware_credentials where venue_id = p_venue_id;
  return jsonb_build_object('providers', v_out);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete: admin removes a provider's creds + its Vault secret
-- ---------------------------------------------------------------------------
create or replace function public.delete_hardware_credentials(p_venue_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_ref uuid;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null then raise exception 'venue_not_found'; end if;
  if not (public.is_org_admin(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;
  select secret_ref into v_ref from public.hardware_credentials where venue_id = p_venue_id and provider = p_provider;
  delete from public.hardware_credentials where venue_id = p_venue_id and provider = p_provider;
  if v_ref is not null then delete from vault.secrets where id = v_ref; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- secret read: ONLY the service-role edge function. Returns server + auth_key.
-- Revoked from anon/authenticated so members can never exfiltrate the key.
-- ---------------------------------------------------------------------------
create or replace function public.get_hardware_secret(p_venue_id uuid, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_ref uuid; v_server text; v_secret text;
begin
  select secret_ref, server into v_ref, v_server
    from public.hardware_credentials where venue_id = p_venue_id and provider = p_provider;
  if v_ref is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_ref;
  return jsonb_build_object('server', v_server, 'auth_key', (v_secret::jsonb)->>'auth_key');
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke all on function public.save_hardware_credentials(uuid, text, text, text) from public, anon;
revoke all on function public.get_hardware_settings(uuid)                       from public, anon;
revoke all on function public.delete_hardware_credentials(uuid, text)           from public, anon;
revoke all on function public.get_hardware_secret(uuid, text)                   from public, anon, authenticated;

grant execute on function public.save_hardware_credentials(uuid, text, text, text) to authenticated;
grant execute on function public.get_hardware_settings(uuid)                       to authenticated;
grant execute on function public.delete_hardware_credentials(uuid, text)           to authenticated;
grant execute on function public.get_hardware_secret(uuid, text)                   to service_role;
