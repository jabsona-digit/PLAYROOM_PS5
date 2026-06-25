-- 0136 - Index every unindexed foreign-key column (Supabase advisor: "Unindexed
-- foreign keys" + postgres-best-practices schema-foreign-key-indexes, HIGH impact).
--
-- Postgres does NOT auto-index FK columns, so JOINs, FK lookups and ON DELETE CASCADE
-- on these columns fall back to a sequential scan. At today's data volume that's cheap,
-- but this is the pre-onboarding hardening window and the indexes are tiny + idempotent.
-- Covers all 53 FKs flagged by the advisor (generated from pg_constraint vs pg_index):
-- tenant `org_id` filters used in RLS, the tournament bracket graph (p1/p2/winner/
-- next_match), session/bill links (service_requests, power_events, reservations),
-- marketplace FKs, and the colder actor columns (created_by/invited_by/…) so the
-- advisor reads fully clean. All `if not exists` → safe to re-run.

create index if not exists audit_logs_venue_id_idx on public.audit_logs (venue_id);
create index if not exists bar_categories_parent_id_idx on public.bar_categories (parent_id);
create index if not exists bar_sale_items_product_id_idx on public.bar_sale_items (product_id);
create index if not exists bar_sales_created_by_idx on public.bar_sales (created_by);
create index if not exists cash_drawers_closed_by_idx on public.cash_drawers (closed_by);
create index if not exists cash_drawers_opened_by_idx on public.cash_drawers (opened_by);
create index if not exists cash_drawers_org_id_idx on public.cash_drawers (org_id);
create index if not exists cash_reconciliations_org_id_idx on public.cash_reconciliations (org_id);
create index if not exists cash_reconciliations_reconciled_by_idx on public.cash_reconciliations (reconciled_by);
create index if not exists cash_reconciliations_shift_id_idx on public.cash_reconciliations (shift_id);
create index if not exists customer_credits_org_id_idx on public.customer_credits (org_id);
create index if not exists customer_credits_tournament_id_idx on public.customer_credits (tournament_id);
create index if not exists customer_credits_venue_id_idx on public.customer_credits (venue_id);
create index if not exists dynamic_pricing_rules_org_id_idx on public.dynamic_pricing_rules (org_id);
create index if not exists employees_user_id_idx on public.employees (user_id);
create index if not exists hardware_credentials_org_id_idx on public.hardware_credentials (org_id);
create index if not exists invoices_created_by_idx on public.invoices (created_by);
create index if not exists invoices_venue_id_idx on public.invoices (venue_id);
create index if not exists marketplace_bookings_pricing_plan_id_idx on public.marketplace_bookings (pricing_plan_id);
create index if not exists marketplace_bookings_reservation_id_idx on public.marketplace_bookings (reservation_id);
create index if not exists marketplace_customers_referred_by_idx on public.marketplace_customers (referred_by);
create index if not exists marketplace_reviews_customer_id_idx on public.marketplace_reviews (customer_id);
create index if not exists marketplace_reviews_org_id_idx on public.marketplace_reviews (org_id);
create index if not exists org_invites_accepted_by_idx on public.org_invites (accepted_by);
create index if not exists org_invites_invited_by_idx on public.org_invites (invited_by);
create index if not exists payroll_runs_run_by_idx on public.payroll_runs (run_by);
create index if not exists payroll_runs_venue_id_idx on public.payroll_runs (venue_id);
create index if not exists platform_payments_recorded_by_idx on public.platform_payments (recorded_by);
create index if not exists power_events_org_id_idx on public.power_events (org_id);
create index if not exists power_events_session_id_idx on public.power_events (session_id);
create index if not exists referral_earnings_referee_id_idx on public.referral_earnings (referee_id);
create index if not exists reservations_console_id_idx on public.reservations (console_id);
create index if not exists reservations_org_id_idx on public.reservations (org_id);
create index if not exists reservations_session_id_idx on public.reservations (session_id);
create index if not exists service_requests_sale_id_idx on public.service_requests (sale_id);
create index if not exists service_requests_session_id_idx on public.service_requests (session_id);
create index if not exists telegram_link_codes_org_id_idx on public.telegram_link_codes (org_id);
create index if not exists tournament_groups_org_id_idx on public.tournament_groups (org_id);
create index if not exists tournament_groups_tournament_id_idx on public.tournament_groups (tournament_id);
create index if not exists tournament_host_offers_org_id_idx on public.tournament_host_offers (org_id);
create index if not exists tournament_host_offers_venue_id_idx on public.tournament_host_offers (venue_id);
create index if not exists tournament_matches_console_id_idx on public.tournament_matches (console_id);
create index if not exists tournament_matches_next_match_id_idx on public.tournament_matches (next_match_id);
create index if not exists tournament_matches_org_id_idx on public.tournament_matches (org_id);
create index if not exists tournament_matches_p1_id_idx on public.tournament_matches (p1_id);
create index if not exists tournament_matches_p2_id_idx on public.tournament_matches (p2_id);
create index if not exists tournament_matches_winner_id_idx on public.tournament_matches (winner_id);
create index if not exists tournament_participants_org_id_idx on public.tournament_participants (org_id);
create index if not exists tournament_payouts_org_id_idx on public.tournament_payouts (org_id);
create index if not exists tournaments_host_org_id_idx on public.tournaments (host_org_id);
create index if not exists tournaments_venue_id_idx on public.tournaments (venue_id);
create index if not exists tournaments_winner_participant_id_idx on public.tournaments (winner_participant_id);
create index if not exists venue_budgets_org_id_idx on public.venue_budgets (org_id);
