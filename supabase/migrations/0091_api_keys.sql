-- 0091 - API keys: secure programmatic / device access (the "generator").
--
-- Phase 1 of the API-key feature: key LIFECYCLE only. We store ONLY a sha256 hash of
-- the key; the raw key is shown ONCE at creation and never again. Per-owner keys
-- (org_id set, org-admin gated) + platform keys (org_id NULL, platform-admin gated).
-- The API surface these keys authenticate against ships in Phase 2 (edge gateway);
-- verify_api_key is included now so that gateway has its server-side check ready.
--
-- pgcrypto (digest / gen_random_bytes) lives in the `extensions` schema on Supabase,
-- so every SECURITY DEFINER function that calls it must include `extensions` in its
-- search_path (see 0002, which fixed the same class of bug for crypt()).

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade,  -- NULL = platform key
  name         text not null,
  key_prefix   text not null,            -- safe-to-show identifier, e.g. mk_live_a1b2c3d4
  key_hash     text not null unique,     -- sha256(full key); the raw key is NEVER stored
  scopes       text[] not null default '{}',
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_keys_org_idx on public.api_keys (org_id) where revoked_at is null;

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
-- (no RLS policies on purpose: all access goes through the SECURITY DEFINER RPCs below)

-- create_api_key: returns the RAW key ONCE. org_id NULL => platform key (platform admin),
-- otherwise an org key (caller must be an admin of that org).
create or replace function public.create_api_key(
  p_name       text,
  p_scopes     text[] default '{}',
  p_org_id     uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key    text;
  v_prefix text;
  v_id     uuid;
  v_count  int;
begin
  if p_org_id is null then
    if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  else
    if not public.is_org_admin(p_org_id) then raise exception 'insufficient_privilege'; end if;
  end if;

  -- soft cap on live keys to keep the attack surface small
  select count(*) into v_count from public.api_keys
    where revoked_at is null and org_id is not distinct from p_org_id;
  if v_count >= 20 then return jsonb_build_object('error', 'too_many_keys'); end if;

  -- 24 random bytes -> 48 hex chars (192 bits of entropy)
  v_key    := 'mk_' || case when p_org_id is null then 'plat_' else 'live_' end
              || encode(gen_random_bytes(24), 'hex');
  v_prefix := left(v_key, 16);

  insert into public.api_keys (org_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
    values (p_org_id, coalesce(nullif(btrim(p_name), ''), 'key'), v_prefix,
            encode(digest(v_key, 'sha256'), 'hex'), coalesce(p_scopes, '{}'),
            auth.uid(), p_expires_at)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'prefix', v_prefix, 'key', v_key);
end;
$$;

-- list_api_keys: metadata only (never the hash, never the raw key).
create or replace function public.list_api_keys(p_org_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  else
    if not public.is_org_admin(p_org_id) then raise exception 'insufficient_privilege'; end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'prefix', key_prefix, 'scopes', scopes,
      'created_at', created_at, 'last_used_at', last_used_at,
      'expires_at', expires_at, 'revoked_at', revoked_at)
      order by created_at desc)
    from public.api_keys
    where org_id is not distinct from p_org_id
  ), '[]'::jsonb);
end;
$$;

-- revoke_api_key: instant kill switch.
create or replace function public.revoke_api_key(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_found boolean := false;
begin
  select org_id, true into v_org, v_found from public.api_keys where id = p_id;
  if not v_found then return jsonb_build_object('error', 'not_found'); end if;
  if v_org is null then
    if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  else
    if not public.is_org_admin(v_org) then raise exception 'insufficient_privilege'; end if;
  end if;
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- verify_api_key: Phase 2 gateway (service role) authenticates an incoming key with this.
-- Returns the owning org + scopes, or {valid:false}. Bumps last_used_at.
create or replace function public.verify_api_key(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_rec public.api_keys;
begin
  select * into v_rec from public.api_keys
    where key_hash = encode(digest(p_key, 'sha256'), 'hex')
      and revoked_at is null
      and (expires_at is null or expires_at > now());
  if v_rec.id is null then return jsonb_build_object('valid', false); end if;
  update public.api_keys set last_used_at = now() where id = v_rec.id;
  return jsonb_build_object('valid', true, 'key_id', v_rec.id, 'org_id', v_rec.org_id, 'scopes', v_rec.scopes);
end;
$$;

revoke all on function public.create_api_key(text, text[], uuid, timestamptz) from public, anon;
revoke all on function public.list_api_keys(uuid)   from public, anon;
revoke all on function public.revoke_api_key(uuid)  from public, anon;
revoke all on function public.verify_api_key(text)  from public, anon, authenticated;
grant execute on function public.create_api_key(text, text[], uuid, timestamptz) to authenticated;
grant execute on function public.list_api_keys(uuid)  to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;
grant execute on function public.verify_api_key(text) to service_role;
