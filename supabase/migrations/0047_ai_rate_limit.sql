-- 0047 — per-user rate limit for the AI assistant.
-- The ai-assistant edge function (authenticated-only) had no per-user throttle,
-- so a logged-in client could loop requests and burn Gemini quota/cost. Expose a
-- thin PUBLIC wrapper over ratelimit.check (0021), keyed by the caller, so the
-- edge function can invoke it via PostgREST (which only sees the public schema).

create or replace function public.ai_rate_limit(p_limit integer default 20)
returns void
language plpgsql
security definer
set search_path = public, ratelimit
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  perform ratelimit.check('ai:' || auth.uid()::text, p_limit);
end;
$$;
revoke all on function public.ai_rate_limit(integer) from public, anon;
grant execute on function public.ai_rate_limit(integer) to authenticated;
