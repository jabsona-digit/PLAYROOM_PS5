-- 0128 - Edge-function error capture (senior-review v2 #2).
-- The 4 edge functions (ai-assistant, telegram-bot, hardware-control, api-gateway) only
-- console.error today -> unhandled failures go SILENT. They are LOAD-BEARING for the
-- anti-fraud wedge (api-gateway + hardware-control serve the LAN agent; telegram-bot
-- serves owner alerts), so a silent failure means the owner stops seeing "every lari".
-- This captures unhandled errors to a table the founder (platform admin) can see.

create table if not exists public.edge_error_log (
  id         bigint generated always as identity primary key,
  fn         text not null,
  message    text not null,
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_edge_error_created on public.edge_error_log (created_at desc);

alter table public.edge_error_log enable row level security;
revoke all on public.edge_error_log from anon, authenticated;
-- founder (platform admin) reads; inserts only via the RPC below.
drop policy if exists edge_error_select on public.edge_error_log;
create policy edge_error_select on public.edge_error_log for select to authenticated
  using (public.is_platform_admin());

-- Called by the edge functions (fire-and-forget). Granted to authenticated (so ai-assistant
-- can log via the CALLER's JWT — preserving its no-service_role invariant) and to service_role
-- (api-gateway / telegram-bot / hardware-control use their service client). NOT anon.
create or replace function public.log_edge_error(p_fn text, p_message text, p_context jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.edge_error_log (fn, message, context)
    values (left(coalesce(p_fn, '?'), 64), left(coalesce(p_message, ''), 2000), coalesce(p_context, '{}'::jsonb));
end; $$;
revoke all on function public.log_edge_error(text, text, jsonb) from public, anon;
grant execute on function public.log_edge_error(text, text, jsonb) to authenticated, service_role;

-- Founder rollup for a future God-Mode card (recent edge errors, platform-admin only).
create or replace function public.get_edge_errors(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'insufficient_privilege'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'fn', fn, 'message', message, 'context', context, 'at', created_at)
                     order by created_at desc)
    from (select * from public.edge_error_log order by created_at desc limit least(greatest(coalesce(p_limit,50),1),200)) e
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_edge_errors(int) from public, anon;
grant execute on function public.get_edge_errors(int) to authenticated;
