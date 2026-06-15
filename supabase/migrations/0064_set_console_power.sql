-- 0064 Hardware control — the command entry point + ghost-query refinement.
--
-- set_console_power() is what the app calls on session start/end and for manual
-- Force ON/OFF. It sets the console's desired_state and, for manual/no-device
-- consoles, logs the power_event immediately (the command IS the action). For
-- cloud/agent devices it only records intent (desired_state) and returns the
-- driver+config so the executor (edge function / local agent) performs the real
-- device call and then logs the outcome via log_power_event().
--
-- Authz: session on/off = member; Force on/off (admin_force) = org admin only.

create or replace function public.set_console_power(
  p_console_id   int,
  p_action       text,
  p_session_id   uuid default null,
  p_triggered_by text default 'admin_force'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hw      public.console_hardware;
  v_org     uuid;
  v_ven     uuid;
  v_mode    text;
  v_desired text;
  v_force   boolean;
begin
  if p_action not in ('on', 'off', 'force_on', 'force_off') then raise exception 'bad_action'; end if;
  if p_triggered_by not in ('session_start','session_end','admin_force','timeout','agent_init','state_poll') then
    raise exception 'bad_trigger';
  end if;
  v_force := p_action in ('force_on', 'force_off') or p_triggered_by = 'admin_force';

  select * into v_hw from public.console_hardware where console_id = p_console_id;
  if v_hw.id is not null then
    v_org := v_hw.org_id; v_ven := v_hw.venue_id;
  else
    select org_id, venue_id into v_org, v_ven from public.consoles where id = p_console_id;
  end if;
  if v_org is null then raise exception 'console_not_found'; end if;

  -- a manual Force is an admin override; routine session power is member-level
  if v_force then
    if not (public.is_org_admin(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;
  else
    if not (public.is_org_member(v_org) or public.is_platform_admin()) then raise exception 'insufficient_privilege'; end if;
  end if;

  v_desired := case when p_action in ('on', 'force_on') then 'on' else 'off' end;
  v_mode    := coalesce(v_hw.control_mode, 'none');

  if v_hw.id is not null then
    update public.console_hardware set desired_state = v_desired where id = v_hw.id;
  end if;

  -- manual / no device: the command is the action — record it now.
  -- cloud / agent: only desired_state is set here; the executor logs the outcome.
  if v_mode in ('manual', 'none') then
    perform public.log_power_event(p_console_id, p_action, p_triggered_by, p_session_id, true, null);
  end if;

  return jsonb_build_object(
    'ok', true, 'mode', v_mode, 'driver', coalesce(v_hw.driver, 'none'),
    'desired', v_desired, 'config', coalesce(v_hw.config, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.set_console_power(int, text, uuid, text) from public, anon;
grant execute on function public.set_console_power(int, text, uuid, text) to authenticated;

-- Refine ghost detection: the genuine fraud signal is a state-poll finding a
-- console powered ON with no active session (agent, Phase 3). Session on/off and
-- admin force are legitimate, so they must never be flagged.
create or replace function public.get_ghost_power_events(
  p_venue_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
)
returns table (console_id int, powered_on_at timestamptz, operator_id uuid, triggered_by text)
language sql
stable
security definer
set search_path = public
as $$
  select pe.console_id, pe.created_at, pe.operator_id, pe.triggered_by
  from public.power_events pe
  where pe.venue_id = p_venue_id
    and pe.action = 'on'
    and pe.session_id is null
    and pe.triggered_by = 'state_poll'
    and pe.created_at between p_from and p_to
    and (public.is_org_member(pe.org_id) or public.is_platform_admin())
  order by pe.created_at desc
$$;
