-- 0063 Hardware console control — device-agnostic FOUNDATION.
--
-- Goal: tie physical power/signal to session status so staff can't run a console
-- without an open session (lost revenue + invisible to anti-fraud/RevPACH).
--
-- Vendor-agnostic by design — a console maps to ONE hardware config with a
-- `control_mode` (manual | cloud | agent) + a free-form `driver` + `config` jsonb,
-- so new devices (Shelly, Tuya, USR/Waveshare relay, HDMI matrix, UniFi…) need a
-- new driver in code, NOT a new migration.
--
-- SSD SAFETY: PS5/console hard power-off can corrupt the SSD. So `target` says
-- WHAT gets cut and defaults to 'tv' (the relay/plug sits on the TV's power or
-- the HDMI signal) — the console itself stays powered. Cutting the console
-- directly is allowed but discouraged in the UI.
--
-- This migration ships only the data model + audit + anti-fraud read + the RPC
-- the executor (edge function / local agent) calls to log outcomes. The actual
-- device dispatch (cloud API / agent) and session hooks come next.

-- ---------------------------------------------------------------------------
-- 1. console_hardware — one mapping per console
-- ---------------------------------------------------------------------------
create table public.console_hardware (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  venue_id        uuid not null references public.venues(id)        on delete cascade,
  console_id      int  not null references public.consoles(id)      on delete cascade,

  control_mode    text not null default 'manual' check (control_mode in ('manual', 'cloud', 'agent')),
  driver          text not null default 'none',   -- 'shelly_cloud','shelly_lan','tuya','relay_modbus','relay_tcp','hdmi_rs232','unifi',…
  target          text not null default 'tv'  check (target in ('tv', 'console', 'hdmi', 'network')),

  config          jsonb not null default '{}'::jsonb,  -- { ip, port, channel, device_id, … } per driver
  secret_ref      uuid,                                 -- Supabase Vault ref for cloud API tokens

  is_active       boolean not null default true,
  desired_state   text check (desired_state in ('on', 'off')),
  last_known_state text not null default 'unknown' check (last_known_state in ('on', 'off', 'unknown')),
  last_seen_at    timestamptz,
  last_command    text,
  last_command_at timestamptz,
  created_at      timestamptz not null default now(),

  unique (console_id)
);
create index console_hardware_venue_idx on public.console_hardware(venue_id);
create index console_hardware_org_idx   on public.console_hardware(org_id);

alter table public.console_hardware enable row level security;
create policy "hw_member_read" on public.console_hardware for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy "hw_admin_write" on public.console_hardware for all to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin())
  with check (public.is_org_admin(org_id) or public.is_platform_admin());
revoke all on public.console_hardware from anon;

-- ---------------------------------------------------------------------------
-- 2. power_events — every on/off, the audit trail + anti-fraud source
-- ---------------------------------------------------------------------------
create table public.power_events (
  id            bigserial primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid not null references public.venues(id)        on delete cascade,
  console_id    int  not null,
  session_id    uuid references public.sessions(id) on delete set null,  -- NULL = no session (🚨 with action='on')
  action        text not null check (action in ('on', 'off', 'force_on', 'force_off')),
  triggered_by  text not null check (triggered_by in (
                  'session_start', 'session_end', 'admin_force', 'timeout', 'agent_init', 'state_poll')),
  operator_id   uuid,                 -- auth.uid() who triggered (null for agent/system)
  success       boolean not null default true,
  error_msg     text,
  created_at    timestamptz not null default now()
);
create index power_events_venue_idx on public.power_events(venue_id, created_at desc);
create index power_events_ghost_idx on public.power_events(venue_id, console_id, created_at)
  where session_id is null and action = 'on';

alter table public.power_events enable row level security;
create policy "pe_member_read" on public.power_events for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
-- writes go through the SECURITY DEFINER RPC only
revoke all on public.power_events from anon;
revoke insert, update, delete on public.power_events from authenticated;

-- ---------------------------------------------------------------------------
-- 3. log_power_event — the executor (edge fn / local agent) reports an outcome.
--    Member-gated; resolves org/venue from the console's hardware mapping and,
--    on success, syncs last_known_state. Returns the new event id.
-- ---------------------------------------------------------------------------
create or replace function public.log_power_event(
  p_console_id   int,
  p_action       text,
  p_triggered_by text,
  p_session_id   uuid    default null,
  p_success      boolean default true,
  p_error        text    default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hw  public.console_hardware;
  v_org uuid;
  v_ven uuid;
  v_id  bigint;
begin
  if p_action not in ('on', 'off', 'force_on', 'force_off') then
    raise exception 'bad_action';
  end if;
  if p_triggered_by not in ('session_start','session_end','admin_force','timeout','agent_init','state_poll') then
    raise exception 'bad_trigger';
  end if;

  select * into v_hw from public.console_hardware where console_id = p_console_id;
  if v_hw.id is not null then
    v_org := v_hw.org_id; v_ven := v_hw.venue_id;
  else
    -- no mapping yet: fall back to the console's own org/venue
    select org_id, venue_id into v_org, v_ven from public.consoles where id = p_console_id;
  end if;
  if v_org is null then raise exception 'console_not_found'; end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'insufficient_privilege';
  end if;

  insert into public.power_events (org_id, venue_id, console_id, session_id, action, triggered_by, operator_id, success, error_msg)
    values (v_org, v_ven, p_console_id, p_session_id, p_action,
            p_triggered_by, auth.uid(), coalesce(p_success, true), p_error)
    returning id into v_id;

  if coalesce(p_success, true) and v_hw.id is not null then
    update public.console_hardware
      set last_known_state = case when p_action in ('on','force_on') then 'on' else 'off' end,
          last_command = p_action, last_command_at = now(), last_seen_at = now()
      where id = v_hw.id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. get_ghost_power_events — anti-fraud: a console powered ON with no session
--    (state-poll caught a relay open outside Martelounge, or a force without a
--    session). Feeds fraud-audit.tsx + the AI auditor.
-- ---------------------------------------------------------------------------
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
    and pe.triggered_by <> 'admin_force'
    and pe.created_at between p_from and p_to
    and (public.is_org_member(pe.org_id) or public.is_platform_admin())
  order by pe.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.log_power_event(int, text, text, uuid, boolean, text)  from public, anon;
revoke all on function public.get_ghost_power_events(uuid, timestamptz, timestamptz)  from public, anon;
grant execute on function public.log_power_event(int, text, text, uuid, boolean, text) to authenticated;
grant execute on function public.get_ghost_power_events(uuid, timestamptz, timestamptz) to authenticated;
