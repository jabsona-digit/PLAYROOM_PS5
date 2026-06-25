-- 0138 - Security advisor hardening (Supabase database linter, security run).
-- Three classes of finding, all safe to fix without touching behavior:
--
-- A) TRIGGER functions exposed via the REST API. 14 SECURITY DEFINER trigger functions
--    were callable by anon/authenticated through /rest/v1/rpc/<fn> (default PUBLIC grant).
--    A trigger fires as the table owner regardless of the caller's EXECUTE privilege, so
--    revoking EXECUTE does NOT stop the trigger — it only removes a needless RPC surface.
--
-- B) Internal-only cash helpers leaked to anon. cash_expected / cash_opener_name are
--    SECURITY DEFINER with NO internal auth check (they're called only from the definer
--    RPCs close_cash_drawer / get_open_drawer, which run as postgres). They were granted
--    to anon+authenticated → an anon caller could POST cash_expected(any_venue_id,…) and
--    read another tenant's expected-cash figure. Revoke from anon+authenticated; the
--    internal definer callers are unaffected (they don't need the grant). No frontend
--    calls them directly (verified).
--
-- C) Mutable search_path on 6 functions → pin it (anti search_path injection / linter).
--    All 6 are SECURITY INVOKER; ALTER … SET search_path pins them without recreating.

-- ── A) revoke EXECUTE on trigger functions (triggers still fire) ──────────────
revoke execute on function public.accrue_loyalty_points()        from public, anon, authenticated;
revoke execute on function public.accrue_referral_earning()      from public, anon, authenticated;
revoke execute on function public.apply_dynamic_pricing()        from public, anon, authenticated;
revoke execute on function public.bump_console_usage()           from public, anon, authenticated;
revoke execute on function public.enforce_console_limit()        from public, anon, authenticated;
revoke execute on function public.enforce_employee_limit()       from public, anon, authenticated;
revoke execute on function public.enforce_hardware_required()    from public, anon, authenticated;
revoke execute on function public.enforce_venue_limit()          from public, anon, authenticated;
revoke execute on function public.gate_bar_sale_plan()           from public, anon, authenticated;
revoke execute on function public.gate_enterprise_fiscal()       from public, anon, authenticated;
revoke execute on function public.gate_pro_feature()             from public, anon, authenticated;
revoke execute on function public.tg_booking_telegram_alert()    from public, anon, authenticated;
revoke execute on function public.tg_low_stock_telegram_alert()  from public, anon, authenticated;
revoke execute on function public.tg_new_tenant_platform_alert() from public, anon, authenticated;

-- ── B) lock the internal cash helpers (close the anon cross-tenant leak) ──────
revoke execute on function public.cash_expected(uuid, timestamptz, timestamptz, numeric) from public, anon, authenticated;
revoke execute on function public.cash_opener_name(uuid, uuid)                            from public, anon, authenticated;

-- ── C) pin search_path on the 6 flagged functions ───────────────────────────
alter function public.set_updated_at()                  set search_path = public;
alter function public.guard_nonneg_stock()              set search_path = public;
alter function public.gen_session_portal_code()         set search_path = public;
alter function public.plan_rank(text)                   set search_path = public;
alter function public.plan_monthly_price(text)          set search_path = public;
alter function public.plan_limit(text, text)            set search_path = public;
