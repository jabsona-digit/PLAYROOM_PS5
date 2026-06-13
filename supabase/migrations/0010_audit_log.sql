-- 0010_audit_log
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606181530). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0010: Audit Log
-- Trigger-based: fires automatically on sessions / bar_sales /
-- shifts / venues — no changes to existing RPCs needed.
-- ============================================================

-- 1. Table
create table public.audit_logs (
  id           bigserial primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  venue_id     uuid references public.venues(id) on delete set null,
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  entity_type  text not null,
  entity_id    text not null,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);
create index audit_logs_entity_idx      on public.audit_logs (entity_type, entity_id);

-- 2. RLS
alter table public.audit_logs enable row level security;

create policy "platform admin reads all"
  on public.audit_logs for select to authenticated
  using (is_platform_admin());

create policy "org admin reads own"
  on public.audit_logs for select to authenticated
  using (is_org_admin(org_id));

-- 3. log_audit() — internal SECURITY DEFINER helper
--    Called from trigger functions only; clients cannot call directly.
create or replace function public.log_audit(
  p_org_id      uuid,
  p_venue_id    uuid,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_payload     jsonb default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.audit_logs (
    org_id, venue_id, actor_id, actor_email,
    action, entity_type, entity_id, payload
  )
  values (
    p_org_id,
    p_venue_id,
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    p_action,
    p_entity_type,
    p_entity_id,
    p_payload
  );
exception when others then
  null; -- audit failure must NEVER break the main operation
end;
$$;

-- Prevent clients from forging audit records
revoke execute on function public.log_audit(uuid, uuid, text, text, text, jsonb) from anon, authenticated;

-- 4. Trigger: sessions (start / end / extend)
create or replace function public.trg_audit_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_audit(
      NEW.org_id, NEW.venue_id,
      'session.start', 'session', NEW.id::text,
      jsonb_build_object(
        'console_id',      NEW.console_id,
        'pricing_plan_id', NEW.pricing_plan_id,
        'duration_min',    NEW.duration_min,
        'price_total',     NEW.price_total,
        'payment_method',  NEW.payment_method,
        'bank',            NEW.bank,
        'customer_name',   NEW.customer_name
      )
    );

  elsif TG_OP = 'UPDATE' then
    -- Session ended
    if OLD.status != 'completed' and NEW.status = 'completed' then
      perform public.log_audit(
        NEW.org_id, NEW.venue_id,
        'session.end', 'session', NEW.id::text,
        jsonb_build_object(
          'price_total',    NEW.price_total,
          'duration_min',   NEW.duration_min,
          'payment_method', NEW.payment_method,
          'bank',           NEW.bank
        )
      );
    -- Session extended (duration grew but not yet completed)
    elsif NEW.status = 'active' and NEW.duration_min > OLD.duration_min then
      perform public.log_audit(
        NEW.org_id, NEW.venue_id,
        'session.extend', 'session', NEW.id::text,
        jsonb_build_object(
          'old_duration_min', OLD.duration_min,
          'new_duration_min', NEW.duration_min,
          'added_min',        NEW.duration_min - OLD.duration_min
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;

create trigger trg_audit_sessions
  after insert or update on public.sessions
  for each row execute function public.trg_audit_sessions();

-- 5. Trigger: bar_sales (create)
create or replace function public.trg_audit_bar_sales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_audit(
    NEW.org_id, NEW.venue_id,
    'bar_sale.create', 'bar_sale', NEW.id::text,
    jsonb_build_object(
      'total',          NEW.total,
      'payment_method', NEW.payment_method,
      'bank',           NEW.bank,
      'session_id',     NEW.session_id
    )
  );
  return NEW;
end;
$$;

create trigger trg_audit_bar_sales
  after insert on public.bar_sales
  for each row execute function public.trg_audit_bar_sales();

-- 6. Trigger: shifts (clock-in / clock-out)
create or replace function public.trg_audit_shifts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_audit(
      NEW.org_id, NEW.venue_id,
      'employee.clock_in', 'shift', NEW.id::text,
      jsonb_build_object('employee_id', NEW.employee_id)
    );
  elsif TG_OP = 'UPDATE'
    and OLD.clock_out is null
    and NEW.clock_out is not null
  then
    perform public.log_audit(
      NEW.org_id, NEW.venue_id,
      'employee.clock_out', 'shift', NEW.id::text,
      jsonb_build_object(
        'employee_id',  NEW.employee_id,
        'hours_worked', NEW.hours_worked
      )
    );
  end if;
  return NEW;
end;
$$;

create trigger trg_audit_shifts
  after insert or update on public.shifts
  for each row execute function public.trg_audit_shifts();

-- 7. Trigger: venues (fiscal enable/disable, name change)
create or replace function public.trg_audit_venues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.fiscal_enabled is distinct from NEW.fiscal_enabled then
    perform public.log_audit(
      NEW.org_id, NEW.id,
      case when NEW.fiscal_enabled then 'fiscal.enable' else 'fiscal.disable' end,
      'venue', NEW.id::text,
      jsonb_build_object(
        'fiscal_tin',           NEW.fiscal_tin,
        'fiscal_business_name', NEW.fiscal_business_name
      )
    );
  end if;

  if OLD.name is distinct from NEW.name then
    perform public.log_audit(
      NEW.org_id, NEW.id,
      'venue.rename', 'venue', NEW.id::text,
      jsonb_build_object('old_name', OLD.name, 'new_name', NEW.name)
    );
  end if;

  return NEW;
end;
$$;

create trigger trg_audit_venues
  after update on public.venues
  for each row execute function public.trg_audit_venues();
