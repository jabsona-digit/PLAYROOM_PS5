-- 0026: daily cash reconciliation. Compare counted cash vs the cash the system
-- expects for a shift (cash sessions + cash bar sales + cash tips).

create table if not exists public.cash_reconciliations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  shift_id      uuid references public.shifts(id) on delete set null,
  period_from   timestamptz not null,
  period_to     timestamptz not null,
  expected_cash numeric(10,2) not null,
  actual_cash   numeric(10,2) not null,
  discrepancy   numeric(10,2) generated always as (actual_cash - expected_cash) stored,
  note          text,
  reconciled_by uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists cash_reconciliations_venue_idx
  on public.cash_reconciliations (venue_id, created_at desc);

alter table public.cash_reconciliations enable row level security;
create policy "recon_select" on public.cash_reconciliations for select to authenticated
  using (is_org_member(org_id) or is_platform_admin());
create policy "recon_insert" on public.cash_reconciliations for insert to authenticated
  with check (is_org_member(org_id));

-- reconcile_shift — compute expected cash for a shift window and record the count.
create or replace function public.reconcile_shift(
  p_venue_id    uuid,
  p_shift_id    uuid,
  p_actual_cash numeric,
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_from     timestamptz;
  v_to       timestamptz;
  v_expected numeric(10,2) := 0;
  v_id       uuid;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;
  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- shift window (open shift → up to now)
  if p_shift_id is not null then
    select clock_in, coalesce(clock_out, now()) into v_from, v_to
    from public.shifts where id = p_shift_id and venue_id = p_venue_id;
    if not found then raise exception 'not_found'; end if;
  else
    v_from := date_trunc('day', now());
    v_to   := now();
  end if;

  -- expected cash = cash sessions (+tips) + cash bar sales (+tips) in the window
  v_expected :=
    coalesce((
      select sum(price_total + coalesce(tip_amount, 0))
      from public.sessions
      where venue_id = p_venue_id and payment_method = 'cash' and status = 'completed'
        and refunded_at is null and ended_at between v_from and v_to
    ), 0)
    + coalesce((
      select sum(total + coalesce(tip_amount, 0))
      from public.bar_sales
      where venue_id = p_venue_id and payment_method = 'cash'
        and voided_at is null and created_at between v_from and v_to
    ), 0);

  insert into public.cash_reconciliations
    (org_id, venue_id, shift_id, period_from, period_to, expected_cash, actual_cash, note, reconciled_by)
  values
    (v_org_id, p_venue_id, p_shift_id, v_from, v_to, v_expected, p_actual_cash, p_note, auth.uid())
  returning id into v_id;

  perform public.log_audit(v_org_id, p_venue_id, 'cash.reconciled', 'cash_reconciliation', v_id::text,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_cash, 'discrepancy', p_actual_cash - v_expected));

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'expected', v_expected,
    'actual', p_actual_cash,
    'discrepancy', round(p_actual_cash - v_expected, 2),
    'alert', abs(p_actual_cash - v_expected) > 5   -- flag if off by > ₾5
  );
end;
$$;

revoke all on function public.reconcile_shift(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.reconcile_shift(uuid, uuid, numeric, text) to authenticated;
