-- 0025: VAT (Accounting v2). Output VAT is computed in the reporting layer
-- (18% inclusive) rather than stored per row — keeps end_session/create_bar_sale
-- untouched (zero hot-path risk). Input VAT is entered by the user on expenses.

-- 1. per-venue VAT registration + input VAT on expenses
alter table public.venues   add column if not exists is_vat_registered boolean not null default false;
alter table public.expenses add column if not exists vat_amount numeric(10,2) not null default 0;

-- 2. get_vat_summary — finance-scoped (owner/admin/accountant). 18% inclusive.
create or replace function public.get_vat_summary(p_venue_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_is_vat boolean;
  v_gross  numeric := 0;
  v_output numeric := 0;
  v_input  numeric := 0;
begin
  select org_id, is_vat_registered into v_org_id, v_is_vat
  from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not public.is_org_accountant(v_org_id) and not public.is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- gross sales = completed sessions + non-voided bar sales in the period
  select coalesce(sum(price_total), 0) into v_gross
  from public.sessions
  where venue_id = p_venue_id and started_at::date between p_from and p_to
    and status = 'completed';

  v_gross := v_gross + coalesce((
    select sum(total) from public.bar_sales
    where venue_id = p_venue_id and created_at::date between p_from and p_to
      and voided_at is null
  ), 0);

  -- output VAT only if the venue is VAT-registered (18% inclusive)
  if v_is_vat then
    v_output := round(v_gross - v_gross / 1.18, 2);
  end if;

  -- input VAT = user-entered VAT on expenses for the period
  select coalesce(sum(vat_amount), 0) into v_input
  from public.expenses
  where venue_id = p_venue_id and expense_date between p_from and p_to;

  return jsonb_build_object(
    'is_vat_registered', v_is_vat,
    'gross_sales',       round(v_gross, 2),
    'output_vat',        v_output,
    'input_vat',         round(v_input, 2),
    'net_vat_payable',   round(v_output - v_input, 2)
  );
end;
$$;

revoke all on function public.get_vat_summary(uuid, date, date) from public, anon;
grant execute on function public.get_vat_summary(uuid, date, date) to authenticated;
