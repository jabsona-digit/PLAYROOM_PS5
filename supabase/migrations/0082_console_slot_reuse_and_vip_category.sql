-- 0082 — reusable console slots + VIP as its own pricing category.
--
-- 1) Soft-deleted consoles kept HOLDING their (venue_id, slot_number) under the full
--    unique constraint, so re-adding a console after a delete hit a duplicate-slot
--    error (and the admin still showed deleted units — fixed separately by filtering
--    deleted_at in loadLive). Make the slot uniqueness ignore soft-deleted rows so a
--    freed slot can be reused.
alter table public.consoles drop constraint if exists consoles_slot_number_venue_key;
drop index if exists consoles_slot_number_venue_key;
create unique index if not exists consoles_slot_live_uniq
  on public.consoles (venue_id, slot_number) where deleted_at is null;

-- 2) VIP gets its OWN pricing category so a VIP console shows a VIP tariff instead of
--    the standard PS5 prices, and the duplicate "კუპე" premium is merged into VIP.
--    (Marketplace booking maps console_type 'vip' → category 'vip'; the admin cashier
--    keeps VIP grouped under playroom, so no cashier ripple.)
alter table public.pricing_plans drop constraint if exists pricing_plans_category_check;
alter table public.pricing_plans
  add constraint pricing_plans_category_check
  check (category is null or category in ('playroom','billiard','karaoke','vr','vip'));

-- NB applied to prod with this migration (data, org-specific):
--   • the "კუპე" plan (id 7) → category='vip', name='VIP'
--   • a one-off clean-slate: soft-deleted all gamelounge consoles (owner recreates).
