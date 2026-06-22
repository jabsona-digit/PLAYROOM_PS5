-- 0126 - LAN agent heartbeat (the "agent online" signal).
-- The agent (hardware/lan-agent) posts this every poll. It bumps last_seen_at for
-- the org's 'agent' consoles WITHOUT writing a power_event (state acks already do
-- that on change; a heartbeat every few seconds must NOT spam the audit trail).
-- The panel reads console_hardware.last_seen_at to show online/offline.
-- Service-role only (called by the api-gateway after verify_api_key), like 0092.

create or replace function public.api_device_heartbeat(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.console_hardware
    set last_seen_at = now()
    where org_id = p_org_id and control_mode = 'agent';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'consoles', n);
end;
$$;

revoke all on function public.api_device_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.api_device_heartbeat(uuid) to service_role;
