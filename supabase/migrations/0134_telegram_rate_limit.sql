-- 0134 - Telegram bot per-chat rate-limit (SENIOR_REVIEW_HANDOFF_v3 #6, blast radius).
-- The shared @playmarteloungebot webhook serves every tenant; one chat flooding commands would
-- hammer the DB (service-role RPCs) + the Telegram API for everyone. Cap each chat to N
-- commands/minute via a sliding window, checked before any real work in the edge function.

create table if not exists public.telegram_rate_limit (
  chat_id      bigint primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);
alter table public.telegram_rate_limit enable row level security;   -- service-role only; no anon/authenticated policy
revoke all on public.telegram_rate_limit from anon, authenticated;

-- Atomic sliding-window check+bump. Returns true if the chat is within the limit this minute.
create or replace function public.telegram_rate_ok(p_chat_id bigint, p_limit int default 20)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into public.telegram_rate_limit as t (chat_id, window_start, count)
    values (p_chat_id, now(), 1)
  on conflict (chat_id) do update
    set window_start = case when t.window_start < now() - interval '1 minute' then now() else t.window_start end,
        count        = case when t.window_start < now() - interval '1 minute' then 1   else t.count + 1 end
  returning count into v_count;
  return v_count <= p_limit;
end; $$;
revoke all on function public.telegram_rate_ok(bigint, int) from public, anon, authenticated;
grant execute on function public.telegram_rate_ok(bigint, int) to service_role;
