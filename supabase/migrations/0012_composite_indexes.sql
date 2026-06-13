-- 0012_composite_indexes
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606182828). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0012: Composite indexes for hot query patterns
-- Single-column indexes already exist; these cover multi-column
-- WHERE clauses used by dashboard, cashier, POS, and history.
-- ============================================================

-- dashboard: active sessions per venue (hot path, loaded every tick)
create index if not exists sessions_venue_status_idx
  on public.sessions (venue_id, status);

-- cashier / history: completed sessions for a venue, ordered by end time
create index if not exists sessions_venue_ended_at_idx
  on public.sessions (venue_id, ended_at desc nulls last)
  where ended_at is not null;

-- cashier: sessions in a date range for a venue (period_revenue queries)
create index if not exists sessions_venue_started_at_idx
  on public.sessions (venue_id, started_at desc);

-- cashier bar revenue: sales for a venue ordered by date
create index if not exists bar_sales_venue_created_at_idx
  on public.bar_sales (venue_id, created_at desc);

-- cashier bar revenue: exclude voided sales from revenue totals
create index if not exists bar_sales_venue_active_idx
  on public.bar_sales (venue_id, created_at desc)
  where voided_at is null;

-- POS product grid: active products per org (loaded every POS open)
create index if not exists bar_products_org_active_idx
  on public.bar_products (org_id, is_active)
  where is_active = true;

-- employees / cashier: active shift per employee (clock-in/out check)
create index if not exists shifts_employee_active_idx
  on public.shifts (employee_id, clock_out)
  where clock_out is null;

-- employees: shifts for a venue on a given date
create index if not exists shifts_venue_work_date_idx
  on public.shifts (venue_id, work_date desc);

-- bar_sale_items: items lookup by sale — already exists but add org for RLS join
create index if not exists bar_sale_items_org_sale_idx
  on public.bar_sale_items (org_id, sale_id);
