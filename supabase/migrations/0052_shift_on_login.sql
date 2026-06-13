-- 0052 — Phase 2 (step 1): shifts for logged-in users (ცვლა შესვლისას).
-- Model: unify staff. An org_members login can have a linked employees row
-- (employees.user_id), so login-based attendance flows through the SAME shifts +
-- payroll as PIN staff. accept_invite now auto-provisions that linked employee
-- (no usable PIN — they log in by email). start_shift / end_shift open & close a
-- shift for the current user (idempotent — re-login won't duplicate). A pg_cron
-- job auto-closes shifts left open > 16h so a forgotten login doesn't run forever.

-- 1. link employees ↔ auth user
alter table public.employees
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists employees_org_user_uidx
  on public.employees(org_id, user_id) where user_id is not null;

-- 2. accept_invite also provisions a linked employee (extends 0051)
create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
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

  -- linked staff record (so shifts + payroll see this login). No usable PIN.
  if not exists (select 1 from public.employees where org_id = v_inv.org_id and user_id = v_uid) then
    insert into public.employees (org_id, name, role, pin_hash, is_active, user_id)
    values (v_inv.org_id, split_part(v_email, '@', 1), v_inv.role,
            crypt(gen_random_uuid()::text, gen_salt('bf')), true, v_uid);
  end if;

  update public.org_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id;

  select name into v_name from public.organizations where id = v_inv.org_id;

  perform public.log_audit(v_inv.org_id, null, 'member.join', 'member', v_uid::text,
    jsonb_build_object('role', v_inv.role));

  return jsonb_build_object('ok', true, 'org_id', v_inv.org_id, 'org_name', v_name, 'role', v_inv.role);
end;
$$;

-- 3. start_shift / end_shift for the current login (resolve their employee row)
create or replace function public.start_shift(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_emp integer;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not is_org_member(v_org) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select id into v_emp from public.employees
   where org_id = v_org and user_id = auth.uid() and is_active limit 1;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error', 'no_staff_record');
  end if;

  if exists (select 1 from public.shifts where employee_id = v_emp and clock_out is null) then
    return jsonb_build_object('ok', true, 'already_open', true);
  end if;

  insert into public.shifts (org_id, venue_id, employee_id)
  values (v_org, p_venue_id, v_emp);
  return jsonb_build_object('ok', true, 'started', true);
end;
$$;
revoke all on function public.start_shift(uuid) from public, anon;
grant execute on function public.start_shift(uuid) to authenticated;

create or replace function public.end_shift(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_emp integer;
  v_n   integer;
begin
  select org_id into v_org from public.venues where id = p_venue_id;
  if v_org is null or not is_org_member(v_org) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select id into v_emp from public.employees
   where org_id = v_org and user_id = auth.uid() limit 1;
  if v_emp is null then
    return jsonb_build_object('ok', false, 'error', 'no_staff_record');
  end if;

  update public.shifts set clock_out = now()
   where employee_id = v_emp and clock_out is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'closed', v_n);
end;
$$;
revoke all on function public.end_shift(uuid) from public, anon;
grant execute on function public.end_shift(uuid) to authenticated;

-- 4. auto-close shifts left open > 16h (anti-leak; keeps payroll honest)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'close-stale-shifts') then
    perform cron.unschedule('close-stale-shifts');
  end if;
end $$;
select cron.schedule(
  'close-stale-shifts',
  '*/30 * * * *',
  $$update public.shifts set clock_out = clock_in + interval '16 hours'
     where clock_out is null and clock_in < now() - interval '16 hours'$$
);
