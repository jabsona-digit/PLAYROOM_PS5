-- 0029: align Accounting v2 backend to the (already-built) UI. invoices &
-- invoice_items are brand-new + empty, so renames are zero-risk. Also wires
-- add_expense VAT input and auto-fills venue_budgets.org_id.

-- 1. invoices: match UI field names + status set + issued_at timestamp.
alter table public.invoices rename column vat_amount to vat_total;
alter table public.invoices rename column total      to total_amount;
alter table public.invoices drop column issue_date;
alter table public.invoices add column issued_at timestamptz not null default now();
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'));

-- 2. invoice_items: qty (consistent with bar_sale_items.qty).
alter table public.invoice_items rename column quantity to qty;

-- 3. budget view: actual_expense (singular) to match the UI type.
drop view if exists public.budget_vs_actual;
create view public.budget_vs_actual with (security_invoker = true) as
select
  b.org_id,
  b.venue_id,
  b.month,
  b.revenue_target,
  b.expense_budget,
  coalesce(r.rev, 0) as actual_revenue,
  coalesce(e.exp, 0) as actual_expense,
  coalesce(r.rev, 0) - coalesce(e.exp, 0) as actual_profit,
  case when b.revenue_target > 0
    then round(coalesce(r.rev, 0) / b.revenue_target * 100, 1) end as revenue_pct,
  case when b.expense_budget > 0
    then round(coalesce(e.exp, 0) / b.expense_budget * 100, 1) end as expense_pct
from public.venue_budgets b
left join (
  select venue_id, month, sum(rev) as rev
  from (
    select venue_id, date_trunc('month', started_at)::date as month, price_total as rev
      from public.sessions where status = 'completed'
    union all
    select venue_id, date_trunc('month', created_at)::date as month, total
      from public.bar_sales where voided_at is null
  ) x
  group by venue_id, month
) r on r.venue_id = b.venue_id and r.month = b.month
left join (
  select venue_id, date_trunc('month', expense_date)::date as month, sum(amount) as exp
  from public.expenses group by venue_id, date_trunc('month', expense_date)::date
) e on e.venue_id = b.venue_id and e.month = b.month;

-- 4. add_expense gains p_vat_amount (input VAT) → expenses.vat_amount.
drop function if exists public.add_expense(uuid, text, numeric, text, date);
create or replace function public.add_expense(
  p_venue_id     uuid,
  p_category     text,
  p_amount       numeric,
  p_description  text default null,
  p_expense_date date default current_date,
  p_vat_amount   numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org_id     uuid;
  v_expense_id uuid;
begin
  select org_id into v_org_id from public.venues where id = p_venue_id;
  if not found then raise exception 'not_found'; end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where org_id = v_org_id and user_id = auth.uid()
        and role in ('owner', 'admin', 'manager')
    ) then raise exception 'insufficient_privilege'; end if;
  end if;

  if p_category not in ('rent','salary','utilities','supplies','marketing','maintenance','other') then
    raise exception 'invalid_category';
  end if;

  insert into public.expenses (org_id, venue_id, category, amount, vat_amount, description, expense_date, created_by)
  values (v_org_id, p_venue_id, p_category, p_amount, coalesce(p_vat_amount, 0), p_description, p_expense_date, auth.uid())
  returning id into v_expense_id;

  perform public.log_audit(
    v_org_id, p_venue_id, 'expense.add', 'expense', v_expense_id::text,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'vat', p_vat_amount, 'date', p_expense_date)
  );

  return v_expense_id;
end;
$function$;
revoke all on function public.add_expense(uuid, text, numeric, text, date, numeric) from public, anon;
grant execute on function public.add_expense(uuid, text, numeric, text, date, numeric) to authenticated;

-- 5. venue_budgets.org_id is NOT NULL but the UI upsert doesn't send it →
--    derive it from the venue automatically.
create or replace function private.set_budget_org_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    select org_id into new.org_id from public.venues where id = new.venue_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_set_budget_org_id on public.venue_budgets;
create trigger trg_set_budget_org_id
  before insert or update on public.venue_budgets
  for each row execute function private.set_budget_org_id();
