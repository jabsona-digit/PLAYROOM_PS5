-- 0103 - God-Mode (platform) Telegram alerts: new tenant + daily platform digest.
-- A platform-scoped link binds the founder's chat (separate from any org chat).

-- 1) allow platform-scoped link codes
alter table public.telegram_link_codes alter column org_id drop not null;
alter table public.telegram_link_codes add column if not exists scope text not null default 'org';

-- 2) single-row platform telegram config
create table if not exists public.platform_telegram_config (
  id         int primary key default 1 check (id = 1),
  chat_id    bigint,
  alerts     jsonb not null default '{"new_tenant":true,"daily_digest":true}'::jsonb,
  updated_at timestamptz default now()
);
insert into public.platform_telegram_config (id) values (1) on conflict (id) do nothing;
alter table public.platform_telegram_config enable row level security;
revoke all on public.platform_telegram_config from anon, authenticated;

-- 3) platform admin generates a platform link code
create or replace function public.create_platform_telegram_code()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_code text;
begin
  if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 6));
  insert into public.telegram_link_codes (code, org_id, scope, created_by)
    values (v_code, null, 'platform', auth.uid());
  return jsonb_build_object('ok', true, 'code', v_code);
end; $$;
revoke all on function public.create_platform_telegram_code() from public, anon;
grant execute on function public.create_platform_telegram_code() to authenticated;

create or replace function public.platform_telegram_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  return jsonb_build_object('linked', exists(select 1 from public.platform_telegram_config where id = 1 and chat_id is not null));
end; $$;
revoke all on function public.platform_telegram_status() from public, anon;
grant execute on function public.platform_telegram_status() to authenticated;

-- 4) telegram_link v2: handle org + platform scope (service role; called by the bot)
create or replace function public.telegram_link(p_chat_id bigint, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_scope text; v_org uuid; v_name text;
begin
  select scope, org_id into v_scope, v_org from public.telegram_link_codes
    where code = upper(btrim(p_code)) and used_at is null and expires_at > now();
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_or_expired_code'); end if;
  update public.telegram_link_codes set used_at = now() where code = upper(btrim(p_code));
  if v_scope = 'platform' then
    update public.platform_telegram_config set chat_id = p_chat_id, updated_at = now() where id = 1;
    return jsonb_build_object('ok', true, 'platform', true);
  end if;
  update public.organizations set telegram_chat_id = p_chat_id where id = v_org returning name into v_name;
  return jsonb_build_object('ok', true, 'org_name', v_name);
end; $$;
revoke all on function public.telegram_link(bigint, text) from public, anon, authenticated;
grant execute on function public.telegram_link(bigint, text) to service_role;

-- 5) platform notify (Vault token + pg_net), toggle-gated
create or replace function public.notify_platform_telegram(p_kind text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_chat bigint; v_on boolean; v_token text;
begin
  select chat_id, coalesce((alerts ->> p_kind)::boolean, false) into v_chat, v_on
    from public.platform_telegram_config where id = 1;
  if v_chat is null or not v_on then return; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  if v_token is null then return; end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', p_text, 'parse_mode', 'HTML', 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end; $$;
revoke all on function public.notify_platform_telegram(text, text) from public, anon, authenticated;

-- 6) new tenant -> platform alert
create or replace function public.tg_new_tenant_platform_alert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.notify_platform_telegram('new_tenant',
      '🆕 <b>ახალი tenant</b>' || E'\n' || coalesce(new.name, '') || ' · ' || coalesce(new.plan, 'trial'));
  exception when others then null;
  end;
  return new;
end; $$;
drop trigger if exists trg_new_tenant_platform_alert on public.organizations;
create trigger trg_new_tenant_platform_alert after insert on public.organizations
  for each row execute function public.tg_new_tenant_platform_alert();

-- 7) platform daily digest (cron 17:00 UTC = 21:00 Tbilisi)
create or replace function public.platform_daily_digest()
returns void language plpgsql security definer set search_path = public as $$
declare v_active int; v_trial int; v_overdue int; v_mrr numeric; v_expiring int; v_msg text;
begin
  select count(*) filter (where subscription_status = 'active'),
         count(*) filter (where subscription_status = 'trialing'),
         coalesce(sum(public.plan_monthly_price(plan)) filter (where subscription_status = 'active'), 0)
    into v_active, v_trial, v_mrr from public.organizations;
  select count(*) into v_overdue from public.organizations
    where subscription_status <> 'canceled'
      and coalesce(current_period_end, case when subscription_status = 'trialing' then trial_ends_at end) < now();
  select count(*) into v_expiring from public.organizations
    where subscription_status = 'trialing' and trial_ends_at between now() and now() + interval '3 days';
  v_msg := '👑 <b>პლატფორმა — დღის შეჯამება</b>' || E'\n\n'
    || '🏢 ' || v_active || ' აქტიური · ' || v_trial || ' საცდელი' || E'\n'
    || '💰 MRR: ₾' || to_char(v_mrr, 'FM999990.00') || E'\n'
    || '⚠️ ვადაგადაცილებული: ' || v_overdue || E'\n'
    || '⏳ საცდელი იწურება (3 დღეში): ' || v_expiring;
  begin perform public.notify_platform_telegram('daily_digest', v_msg); exception when others then null; end;
end; $$;
revoke all on function public.platform_daily_digest() from public, anon, authenticated;

do $$ begin perform cron.unschedule('platform-daily-digest'); exception when others then null; end $$;
select cron.schedule('platform-daily-digest', '0 17 * * *', 'select public.platform_daily_digest()');
