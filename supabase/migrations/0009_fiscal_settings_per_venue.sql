-- 0009_fiscal_settings_per_venue
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606132950). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- 0009: fiscal receipt settings per venue (RS.GE Phase B — PDF receipts, hardware bridge later)
alter table public.venues
  add column if not exists fiscal_enabled boolean not null default false,
  add column if not exists fiscal_tin text,
  add column if not exists fiscal_business_name text,
  add column if not exists fiscal_address text;

-- receipt sequence: simple per-venue integer counter for receipt numbers
create sequence if not exists public.fiscal_receipt_seq start 1000 increment 1;

-- helper function: next receipt number formatted as GE-YYYYMMDD-XXXXXX
create or replace function public.next_fiscal_receipt_no()
returns text
language sql
security definer
set search_path = public
as $$
  select 'GE-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.fiscal_receipt_seq')::text, 6, '0');
$$;

grant execute on function public.next_fiscal_receipt_no() to authenticated;
