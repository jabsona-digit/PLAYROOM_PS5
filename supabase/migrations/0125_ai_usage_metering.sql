-- 0125 - AI usage metering (Gemini cost control / P2-1).
-- Each successful Gemini call logs its token usage so the founder can see AI spend
-- per org and catch runaway usage BEFORE onboarding venues that hammer the assistant.
-- We store raw token counts (authoritative) + model; cost is ESTIMATED at read time
-- in get_ai_usage_stats so rate changes don't require rewriting history.

create table if not exists public.ai_usage_log (
  id                bigint generated always as identity primary key,
  org_id            uuid references public.organizations(id) on delete set null,
  user_id           uuid,
  model             text not null,
  prompt_tokens     int  not null default 0,
  candidates_tokens int  not null default 0,
  total_tokens      int  not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_ai_usage_org_created on public.ai_usage_log (org_id, created_at desc);
create index if not exists idx_ai_usage_created     on public.ai_usage_log (created_at desc);

alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;
-- Own-org members can read their org's usage; platform admin sees everything.
drop policy if exists ai_usage_select on public.ai_usage_log;
create policy ai_usage_select on public.ai_usage_log for select to authenticated
  using (public.is_platform_admin() or (org_id is not null and public.is_org_member(org_id)));

-- Logger: runs as the caller (authenticated). Resolves user + org server-side so the
-- edge function can't spoof them. Guests (auth.uid() null) are skipped silently.
create or replace function public.log_ai_usage(
  p_model text, p_prompt int, p_candidates int, p_total int
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid;
begin
  if v_uid is null then return; end if;          -- guest / anon concierge: skip
  select org_id into v_org from public.org_members where user_id = v_uid limit 1;
  insert into public.ai_usage_log(org_id, user_id, model, prompt_tokens, candidates_tokens, total_tokens)
    values (v_org, v_uid, coalesce(p_model, '?'),
            greatest(coalesce(p_prompt, 0), 0),
            greatest(coalesce(p_candidates, 0), 0),
            greatest(coalesce(p_total, 0), 0));
end; $$;
revoke all on function public.log_ai_usage(text, int, int, int) from public, anon;
grant execute on function public.log_ai_usage(text, int, int, int) to authenticated;

-- God-Mode rollup: per-org tokens + calls + ESTIMATED USD (rough public Gemini rates;
-- flash ~ $0.30/1M in, $2.50/1M out; *-lite ~ $0.10 / $0.40). Estimates, not invoices.
create or replace function public.get_ai_usage_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  with u as (
    select l.org_id,
           coalesce(o.name, '— (no org)') as org_name,
           count(*)                  as calls,
           sum(l.prompt_tokens)      as prompt_tokens,
           sum(l.candidates_tokens)  as candidates_tokens,
           sum(l.total_tokens)       as total_tokens,
           round(sum(
             case when l.model ilike '%lite%'
                  then l.prompt_tokens / 1e6 * 0.10 + l.candidates_tokens / 1e6 * 0.40
                  else l.prompt_tokens / 1e6 * 0.30 + l.candidates_tokens / 1e6 * 2.50
             end)::numeric, 4)       as est_cost_usd
    from public.ai_usage_log l
    left join public.organizations o on o.id = l.org_id
    where l.created_at >= now() - make_interval(days => p_days)
    group by l.org_id, o.name
    order by total_tokens desc
  )
  select jsonb_build_object(
    'days',           p_days,
    'total_calls',    coalesce((select sum(calls)         from u), 0),
    'total_tokens',   coalesce((select sum(total_tokens)  from u), 0),
    'total_cost_usd', coalesce((select sum(est_cost_usd)  from u), 0),
    'by_org',         coalesce((select jsonb_agg(to_jsonb(u)) from u), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;
revoke all on function public.get_ai_usage_stats(int) from public, anon;
grant execute on function public.get_ai_usage_stats(int) to authenticated;
