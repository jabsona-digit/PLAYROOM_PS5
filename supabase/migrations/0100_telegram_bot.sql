-- 0100 - Telegram bot (Phase 1): owner links their chat, then pulls live stats.
--
-- Flow: owner taps "generate code" in Settings -> create_telegram_link_code (admin-gated)
-- -> sends "/link CODE" to the bot -> the `telegram-bot` edge fn (service role, no user JWT,
-- identifies by chat_id) calls telegram_link to bind organizations.telegram_chat_id.
-- Then commands resolve the org by chat_id and read via telegram_org_summary. All Georgian
-- text lives in the edge function; this migration is ASCII.

alter table public.organizations
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_alerts  jsonb not null default
    '{"new_booking":true,"low_stock":true,"daily_brief":false,"fraud_flag":false}'::jsonb;
create unique index if not exists organizations_telegram_chat_idx
  on public.organizations(telegram_chat_id) where telegram_chat_id is not null;

create table if not exists public.telegram_link_codes (
  code       text primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at    timestamptz
);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;

-- owner generates a one-time 6-char link code (admin-gated)
create or replace function public.create_telegram_link_code(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_code text;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'insufficient_privilege'; end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
  insert into public.telegram_link_codes (code, org_id, created_by) values (v_code, p_org_id, auth.uid());
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_in_min', 10);
end;
$$;
revoke all on function public.create_telegram_link_code(uuid) from public, anon;
grant execute on function public.create_telegram_link_code(uuid) to authenticated;

-- is this org linked to Telegram yet? (Settings status)
create or replace function public.telegram_link_status(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(p_org_id) then raise exception 'insufficient_privilege'; end if;
  return jsonb_build_object('linked', exists(
    select 1 from public.organizations where id = p_org_id and telegram_chat_id is not null));
end;
$$;
revoke all on function public.telegram_link_status(uuid) from public, anon;
grant execute on function public.telegram_link_status(uuid) to authenticated;

-- bot binds a chat to an org via a valid code (service role only — no user context)
create or replace function public.telegram_link(p_chat_id bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_name text;
begin
  select org_id into v_org from public.telegram_link_codes
    where code = upper(btrim(p_code)) and used_at is null and expires_at > now();
  if v_org is null then return jsonb_build_object('ok', false, 'error', 'bad_or_expired_code'); end if;
  update public.telegram_link_codes set used_at = now() where code = upper(btrim(p_code));
  update public.organizations set telegram_chat_id = p_chat_id where id = v_org
    returning name into v_name;
  return jsonb_build_object('ok', true, 'org_name', v_name);
end;
$$;
revoke all on function public.telegram_link(bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_link(bigint, text) to service_role;

-- bot: resolve org by chat_id + today's headline numbers (Tbilisi day) (service role only)
create or replace function public.telegram_org_summary(p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org uuid; v_name text;
begin
  select id, name into v_org, v_name from public.organizations where telegram_chat_id = p_chat_id;
  if v_org is null then return jsonb_build_object('linked', false); end if;
  return jsonb_build_object(
    'linked', true,
    'org_name', v_name,
    'active_sessions', (select count(*) from public.sessions where org_id = v_org and status = 'active'),
    'total_consoles',  (select count(*) from public.consoles where org_id = v_org and deleted_at is null),
    'free_consoles',   (select count(*) from public.consoles c where c.org_id = v_org and c.deleted_at is null
                          and not exists (select 1 from public.sessions s where s.console_id = c.id and s.status = 'active')),
    'session_revenue_today', (select coalesce(sum(price_total), 0) from public.sessions
                                where org_id = v_org and status = 'completed'
                                  and (started_at at time zone 'Asia/Tbilisi')::date = (now() at time zone 'Asia/Tbilisi')::date),
    'bar_revenue_today',     (select coalesce(sum(total), 0) from public.bar_sales
                                where org_id = v_org and voided_at is null
                                  and (created_at at time zone 'Asia/Tbilisi')::date = (now() at time zone 'Asia/Tbilisi')::date)
  );
end;
$$;
revoke all on function public.telegram_org_summary(bigint) from public, anon, authenticated;
grant execute on function public.telegram_org_summary(bigint) to service_role;
