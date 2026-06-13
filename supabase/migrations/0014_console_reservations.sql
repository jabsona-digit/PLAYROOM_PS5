-- 0014_console_reservations
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606184202). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0014: Console Reservations
-- NOTE: consoles.id is INTEGER (serial) — not UUID.
-- ============================================================

create table public.reservations (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  venue_id       uuid        not null references public.venues(id)       on delete cascade,
  console_id     integer     references public.consoles(id) on delete set null,
  customer_name  text        not null,
  customer_phone text,
  start_time     timestamptz not null,
  duration_min   integer     not null check (duration_min > 0),
  notes          text,
  status         text        not null default 'pending'
                             check (status in ('pending','confirmed','cancelled','completed')),
  session_id     uuid        references public.sessions(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index reservations_venue_start_idx  on public.reservations (venue_id, start_time);
create index reservations_venue_status_idx on public.reservations (venue_id, status)
  where status in ('pending','confirmed');

-- RLS
alter table public.reservations enable row level security;

create policy "org member reads reservations"
  on public.reservations for select to authenticated
  using (is_org_member(org_id));

create policy "platform admin reads all reservations"
  on public.reservations for select to authenticated
  using (is_platform_admin());

-- create_reservation()
create or replace function public.create_reservation(
  p_venue_id      uuid,
  p_customer_name text,
  p_start_time    timestamptz,
  p_duration_min  integer,
  p_console_id    integer    default null,
  p_customer_phone text      default null,
  p_notes         text       default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid;
  v_id     uuid;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- console must belong to this venue
  if p_console_id is not null then
    if not exists (
      select 1 from public.consoles
      where id = p_console_id and venue_id = p_venue_id
    ) then raise exception 'console_not_in_venue'; end if;
  end if;

  insert into public.reservations
    (org_id, venue_id, console_id, customer_name, customer_phone,
     start_time, duration_min, notes)
  values
    (v_org_id, p_venue_id, p_console_id, p_customer_name, p_customer_phone,
     p_start_time, p_duration_min, p_notes)
  returning id into v_id;

  perform public.log_audit(
    v_org_id, p_venue_id,
    'reservation.create', 'reservation', v_id::text,
    jsonb_build_object(
      'customer', p_customer_name,
      'start_time', p_start_time,
      'duration_min', p_duration_min,
      'console_id', p_console_id
    )
  );

  return v_id;
end;
$$;

grant execute on function public.create_reservation(uuid, text, timestamptz, integer, integer, text, text) to authenticated;

-- confirm_reservation()
create or replace function public.confirm_reservation(
  p_reservation_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
begin
  select org_id, venue_id into v_org_id, v_venue_id
  from public.reservations where id = p_reservation_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  update public.reservations
  set status = 'confirmed'
  where id = p_reservation_id and status = 'pending';

  if not found then raise exception 'not_pending'; end if;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'reservation.confirm', 'reservation', p_reservation_id::text, null
  );
end;
$$;

grant execute on function public.confirm_reservation(uuid) to authenticated;

-- cancel_reservation()
create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_reason         text default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
begin
  select org_id, venue_id into v_org_id, v_venue_id
  from public.reservations where id = p_reservation_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = p_reservation_id
    and status in ('pending','confirmed');

  if not found then raise exception 'already_closed'; end if;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'reservation.cancel', 'reservation', p_reservation_id::text,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.cancel_reservation(uuid, text) to authenticated;
