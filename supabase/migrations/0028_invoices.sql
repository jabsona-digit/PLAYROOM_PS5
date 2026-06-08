-- 0028: invoice management (finance-scoped: read = accountant+, write = admin+).

create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  venue_id       uuid references public.venues(id) on delete set null,
  invoice_number text not null,
  client_name    text not null,
  client_tin     text,
  client_address text,
  client_email   text,
  subtotal       numeric(10,2) not null default 0,
  vat_amount     numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  status         text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issue_date     date not null default current_date,
  due_date       date,
  paid_at        timestamptz,
  notes          text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (org_id, invoice_number)
);

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null default 0,
  vat_rate    numeric(5,2)  not null default 18,
  line_total  numeric(10,2) not null default 0
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

create policy "invoice_select" on public.invoices for select to authenticated
  using (is_org_accountant(org_id) or is_platform_admin());
create policy "invoice_write" on public.invoices for all to authenticated
  using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

create policy "invoice_items_select" on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i
    where i.id = invoice_id and (is_org_accountant(i.org_id) or is_platform_admin())));
create policy "invoice_items_write" on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i
    where i.id = invoice_id and (is_org_admin(i.org_id) or is_platform_admin())))
  with check (exists (select 1 from public.invoices i
    where i.id = invoice_id and (is_org_admin(i.org_id) or is_platform_admin())));

-- next sequential invoice number per org: INV-YYYY-NNN
create or replace function public.next_invoice_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  if not public.is_org_admin(p_org_id) then raise exception 'unauthorized'; end if;
  select coalesce(max((regexp_match(invoice_number, 'INV-\d{4}-(\d+)'))[1]::int), 0) + 1
    into v_seq
  from public.invoices
  where org_id = p_org_id
    and invoice_number ~ ('INV-' || extract(year from now())::text || '-\d+');
  return format('INV-%s-%s', extract(year from now())::int, lpad(v_seq::text, 3, '0'));
end;
$$;

revoke all on function public.next_invoice_number(uuid) from public, anon;
grant execute on function public.next_invoice_number(uuid) to authenticated;
