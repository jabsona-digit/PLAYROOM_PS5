-- 0066 Optional "require hardware control to start a session" (owner toggle).
--
-- Hardware control is OPT-IN. Most owner-run playrooms don't need it, so the
-- default is OFF and nothing changes — operators start sessions freely. An owner
-- who relies on power gating for anti-fraud can flip `venues.hardware_required`
-- ON; then a session CANNOT start on a console that has no active hardware
-- mapping (so staff can't bypass the gate by skipping setup).

alter table public.venues add column if not exists hardware_required boolean not null default false;

create or replace function public.enforce_hardware_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_req boolean;
begin
  select hardware_required into v_req from public.venues where id = new.venue_id;
  if coalesce(v_req, false) then
    if not exists (
      select 1 from public.console_hardware
      where console_id = new.console_id and is_active = true
    ) then
      raise exception 'hardware_required' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hardware_required on public.sessions;
create trigger trg_hardware_required
  before insert on public.sessions
  for each row execute function public.enforce_hardware_required();
