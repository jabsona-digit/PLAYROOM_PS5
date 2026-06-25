-- 0137 - RLS performance: wrap bare auth.uid() in (select auth.uid()) so the planner
-- evaluates it ONCE per query (initplan) instead of once per row (postgres-best-practices
-- security-rls-performance, ~100x on large tables). Pure performance — the access logic
-- is byte-for-byte identical, only the call is hoisted. Covers the 10 policies the audit
-- flagged. DROP+CREATE runs in one implicit transaction (atomic, no exposure window).
-- The is_org_member()/is_platform_admin() calls are left as-is (separate, deeper concern).

-- customer_credits / cc_read (SELECT, authenticated)
drop policy if exists cc_read on public.customer_credits;
create policy cc_read on public.customer_credits for select to authenticated
  using (((customer_id = (select auth.uid())) or is_org_member(org_id) or is_platform_admin()));

-- marketplace_bookings / mb_select_own (SELECT, public)
drop policy if exists mb_select_own on public.marketplace_bookings;
create policy mb_select_own on public.marketplace_bookings for select to public
  using (((select auth.uid()) = customer_id));

-- marketplace_customers / mc_insert_own (INSERT, public)
drop policy if exists mc_insert_own on public.marketplace_customers;
create policy mc_insert_own on public.marketplace_customers for insert to public
  with check (((select auth.uid()) = id));

-- marketplace_customers / mc_select_own (SELECT, public)
drop policy if exists mc_select_own on public.marketplace_customers;
create policy mc_select_own on public.marketplace_customers for select to public
  using (((select auth.uid()) = id));

-- marketplace_customers / mc_update_own (UPDATE, public)
drop policy if exists mc_update_own on public.marketplace_customers;
create policy mc_update_own on public.marketplace_customers for update to public
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

-- marketplace_reviews / mr_delete_own (DELETE, public)
drop policy if exists mr_delete_own on public.marketplace_reviews;
create policy mr_delete_own on public.marketplace_reviews for delete to public
  using (((select auth.uid()) = customer_id));

-- marketplace_reviews / mr_select_own (SELECT, public)
drop policy if exists mr_select_own on public.marketplace_reviews;
create policy mr_select_own on public.marketplace_reviews for select to public
  using (((select auth.uid()) = customer_id));

-- marketplace_reviews / mr_update_own (UPDATE, public)
drop policy if exists mr_update_own on public.marketplace_reviews;
create policy mr_update_own on public.marketplace_reviews for update to public
  using (((select auth.uid()) = customer_id))
  with check (((select auth.uid()) = customer_id));

-- referral_earnings / ref_earn_select (SELECT, authenticated)
drop policy if exists ref_earn_select on public.referral_earnings;
create policy ref_earn_select on public.referral_earnings for select to authenticated
  using (((referrer_id = (select auth.uid())) or is_platform_admin()));

-- tournament_registrations / tr_read (SELECT, authenticated)
drop policy if exists tr_read on public.tournament_registrations;
create policy tr_read on public.tournament_registrations for select to authenticated
  using (((customer_id = (select auth.uid())) or is_platform_admin()
    or is_org_member((select t.org_id from public.tournaments t where t.id = tournament_registrations.tournament_id))));
