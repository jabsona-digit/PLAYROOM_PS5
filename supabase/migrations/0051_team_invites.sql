-- 0051 — Team invites: owner/admin invites staff by email; each invitee gets
-- their OWN Supabase login + an org_members row with the assigned role, so RLS
-- enforces access per-user (the real security boundary, vs the client-side PIN
-- gate). Flow (no service_role): create_invite → share link ?invite=TOKEN →
-- invitee self-signs-up with that email → accept_invite links them to the org.

create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin','manager','accountant','cashier','operator')),
  token       text not null unique,
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  unique (org_id, email)
);
create index if not exists org_invites_token_idx on public.org_invites(token);
create index if not exists org_invites_email_idx on public.org_invites(lower(email));

alter table public.org_invites enable row level security;
-- Only owners/admins see/manage their org's invites (the token is a secret link).
-- Acceptance goes through accept_invite (SECURITY DEFINER, by token) so the
-- invitee never needs direct SELECT.
drop policy if exists "org_invites_admin" on public.org_invites;
create policy "org_invites_admin" on public.org_invites for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- create_invite — owner/admin only. Upserts one pending invite per (org,email).
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(p_org uuid, p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_token text;
begin
  perform ratelimit.check('create_invite:' || coalesce(auth.uid()::text, 'anon'), 30);
  if not is_org_admin(p_org) then raise exception 'unauthorized'; end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if p_role not in ('admin','manager','accountant','cashier','operator') then raise exception 'invalid_role'; end if;

  -- already a member of this org?
  if exists (
    select 1 from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org and lower(u.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');

  insert into public.org_invites (org_id, email, role, token, invited_by)
  values (p_org, v_email, p_role, v_token, auth.uid())
  on conflict (org_id, email) do update
    set role = excluded.role,
        token = excluded.token,
        invited_by = excluded.invited_by,
        created_at = now(),
        expires_at = now() + interval '14 days',
        accepted_at = null,
        accepted_by = null;

  perform public.log_audit(p_org, null, 'member.invite', 'invite', v_email,
    jsonb_build_object('role', p_role));

  return jsonb_build_object('ok', true, 'token', v_token, 'email', v_email, 'role', p_role);
end;
$$;
revoke all on function public.create_invite(uuid, text, text) from public, anon;
grant execute on function public.create_invite(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_invite — the signed-in invitee claims their invite by token. Verifies
-- the token, expiry, and that the JWT email matches the invited email.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv   public.org_invites%rowtype;
  v_name  text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;

  select * into v_inv from public.org_invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v_inv.accepted_at is not null then return jsonb_build_object('ok', false, 'error', 'already_used'); end if;
  if v_inv.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if lower(v_inv.email) <> v_email then return jsonb_build_object('ok', false, 'error', 'email_mismatch'); end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update public.org_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  select name into v_name from public.organizations where id = v_inv.org_id;

  perform public.log_audit(v_inv.org_id, null, 'member.join', 'member', v_uid::text,
    jsonb_build_object('role', v_inv.role));

  return jsonb_build_object('ok', true, 'org_id', v_inv.org_id, 'org_name', v_name, 'role', v_inv.role);
end;
$$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_invite — owner/admin removes a pending invite.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_invites where id = p_invite_id;
  if v_org is null then raise exception 'not_found'; end if;
  if not is_org_admin(v_org) then raise exception 'unauthorized'; end if;
  delete from public.org_invites where id = p_invite_id;
end;
$$;
revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_org_members — admin view of the team with emails (auth.users is not
-- client-readable, so expose it through a guarded definer function).
-- ---------------------------------------------------------------------------
create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (is_org_admin(p_org) or is_platform_admin()) then raise exception 'unauthorized'; end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by m.created_at;
end;
$$;
revoke all on function public.list_org_members(uuid) from public, anon;
grant execute on function public.list_org_members(uuid) to authenticated;
