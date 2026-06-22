-- Money-correctness regression SUITE (senior-review P0-2 / P0-3).
--
-- Each test is an independent, ROLLBACK-SAFE DO block: it sets up fixtures, exercises
-- the money RPCs, accumulates any failure into v_fail, then RAISES — so it NEVER mutates
-- real data (everything rolls back with the final RAISE). The final RAISE encodes the
-- verdict the CI runner greps:
--     SUITE_PASS <name> ...   invariant holds
--     SUITE_FAIL <name> ...   an invariant broke (reason follows)
-- The runner (supabase/tests/run_invariants.py, CI .github/workflows/db-invariants.yml)
-- posts each block (split on the marker line below) to the Management API and asserts
-- SUITE_PASS. Safe against prod — rollback only.
--
-- COVERED: tournament prize payout idempotency + money-out reconciliation; credit
-- no-double-redeem + minutes cap + one-way status; create_bar_sale method/bank
-- validation (0099); non-negative stock guard on oversell.
-- DEFERRED to the full audit (add blocks here): end_session 5-min rounding + open
-- 1440 cap; cash_expected reconciliation over a shift; settle_session_tab → exactly one
-- paid bar_sale matching the itemized bill; 5% marketplace commission base.
--
-- Fixtures use the demo org/venue/owner. Each test block is delimited by the marker
-- line that the runner splits on (see run_invariants.py); the runner re-attaches it.

-- @@TEST award_reconciliation
-- 1st=prize_pool(200)+2nd=prize_second(80) → expenses=280; 3rd=prize_third_minutes(60)
-- → customer_credits; 3 payout rows; a second award() call must be idempotent.
do $a$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_t uuid; m record; v_final uuid; v_bronze uuid; v_third uuid;
  v_idem text; v_pay int; v_exp_sum numeric; v_cred_min int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.tournaments (org_id, venue_id, name, game, format, status, entry_fee, prize_pool, prize_second, prize_third_minutes, min_participants)
    values (v_org, v_venue, 'RECON_A', 'FC', 'single_elim', 'registration', 20, 200, 80, 60, 4) returning id into v_t;
  insert into public.tournament_participants (tournament_id, org_id, name)
    values (v_t, v_org, 'A'), (v_t, v_org, 'B'), (v_t, v_org, 'C'), (v_t, v_org, 'D');
  perform public.seed_tournament(v_t);
  for m in select id from public.tournament_matches where tournament_id = v_t and round = 1 and stage = 'knockout' order by position loop
    perform public.report_match(m.id, 1, 0);
  end loop;
  select id into v_final from public.tournament_matches where tournament_id = v_t and stage = 'knockout' and next_match_id is null;
  perform public.report_match(v_final, 1, 0);
  select id into v_bronze from public.tournament_matches where tournament_id = v_t and stage = 'bronze';
  perform public.report_match(v_bronze, 1, 0);
  select winner_id into v_third from public.tournament_matches where id = v_bronze;
  insert into public.tournament_registrations (tournament_id, customer_id, display_name, status, participant_id)
    values (v_t, gen_random_uuid(), 'ThirdGuy', 'checked_in', v_third);
  perform public.award_tournament_prizes(v_t);
  begin perform public.award_tournament_prizes(v_t); v_idem := 'NOT_IDEMPOTENT';
  exception when others then v_idem := 'ok'; end;
  select count(*) into v_pay from public.tournament_payouts where tournament_id = v_t;
  select coalesce(sum(amount), 0) into v_exp_sum from public.expenses where venue_id = v_venue and description like '%RECON_A%';
  select coalesce(sum(minutes), 0) into v_cred_min from public.customer_credits where tournament_id = v_t;
  if v_pay <> 3      then v_fail := v_fail || format(' payouts=%s(exp3)', v_pay); end if;
  if v_exp_sum <> 280 then v_fail := v_fail || format(' expenses=%s(exp280)', v_exp_sum); end if;
  if v_cred_min <> 60 then v_fail := v_fail || format(' credit_min=%s(exp60)', v_cred_min); end if;
  if v_idem <> 'ok'   then v_fail := v_fail || ' idempotency=' || v_idem; end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL award_reconciliation%', v_fail;
  else raise exception 'SUITE_PASS award_reconciliation payouts=3 expenses=280 credit=60 idempotent'; end if;
end $a$;

-- @@TEST credit_no_double_redeem
-- A 60-min credit applied to a completed ₾20 (₾10/h) session discounts it to ₾10; a
-- second apply must be rejected; minutes_used stays 60 (never 120); status → redeemed.
do $b$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_console int; v_sess uuid; v_cred uuid; v_code text; v_cust uuid := gen_random_uuid();
  v_dbl text; v_pt numeric; v_used int; v_status text; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  -- console MUST be in v_venue (enforce_console_capacity 0039 counts the type pool within new.venue_id)
  select id into v_console from public.consoles where venue_id = v_venue and deleted_at is null order by id limit 1;
  -- far-past window so enforce_console_capacity sees no overlapping booking/reservation
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at)
    values (v_console, v_plan, v_org, v_venue, 10, 20, 120, false, 'completed', now() - interval '370 days', now() - interval '370 days' + interval '2 hours') returning id into v_sess;
  insert into public.customer_credits (org_id, venue_id, customer_id, source, minutes, note)
    values (v_org, v_venue, v_cust, 'tournament_prize', 60, 'recon B') returning id into v_cred;
  select code into v_code from public.customer_credits where id = v_cred;
  perform public.apply_credit_to_session(v_sess, v_code);
  begin perform public.apply_credit_to_session(v_sess, v_code); v_dbl := 'DOUBLE_APPLIED';
  exception when others then v_dbl := 'ok'; end;
  select price_total into v_pt from public.sessions where id = v_sess;
  select minutes_used, status into v_used, v_status from public.customer_credits where id = v_cred;
  if v_pt <> 10            then v_fail := v_fail || format(' price=%s(exp10)', v_pt); end if;
  if v_used <> 60          then v_fail := v_fail || format(' used=%s(exp60)', v_used); end if;
  if v_status <> 'redeemed' then v_fail := v_fail || ' status=' || coalesce(v_status,'null'); end if;
  if v_dbl <> 'ok'         then v_fail := v_fail || ' double=' || v_dbl; end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL credit_no_double_redeem%', v_fail;
  else raise exception 'SUITE_PASS credit_no_double_redeem price=10 used=60 redeemed no-double'; end if;
end $b$;

-- @@TEST bar_sale_method_bank_validation
-- create_bar_sale (0099) must reject an invalid payment_method and a non-cash sale with
-- no bank — BEFORE touching stock/data. (Plan-gate neutralized in-block; rolls back.)
do $c$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_e1 text; v_e2 text; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  update public.organizations set plan = 'enterprise' where id = v_org;
  begin perform public.create_bar_sale(p_venue_id => v_venue, p_payment_method => 'WRONG', p_items => '[]'::json, p_bank => null); v_e1 := 'NO_RAISE';
  exception when others then v_e1 := SQLERRM; end;
  begin perform public.create_bar_sale(p_venue_id => v_venue, p_payment_method => 'card', p_items => '[]'::json, p_bank => null); v_e2 := 'NO_RAISE';
  exception when others then v_e2 := SQLERRM; end;
  if v_e1 <> 'invalid_payment_method' then v_fail := v_fail || ' bad_method_got=' || v_e1; end if;
  if v_e2 <> 'invalid_bank'           then v_fail := v_fail || ' card_nobank_got=' || v_e2; end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL bar_sale_method_bank_validation%', v_fail;
  else raise exception 'SUITE_PASS bar_sale_method_bank_validation invalid_method+invalid_bank_rejected'; end if;
end $c$;

-- @@TEST stock_nonneg_guard
-- create_bar_sale must block an oversell (qty > stock) with insufficient_stock and leave
-- the product's stock untouched. (Plan-gate neutralized in-block; rolls back.)
do $d$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_prod int; v_stock int; v_err text; v_after int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  update public.organizations set plan = 'enterprise' where id = v_org;
  select id, coalesce(stock_quantity, 0) into v_prod, v_stock from public.bar_products where org_id = v_org order by id limit 1;
  if v_prod is null then raise exception 'SUITE_FAIL stock_nonneg_guard no_demo_product'; end if;
  begin
    perform public.create_bar_sale(
      p_venue_id => v_venue, p_payment_method => 'cash',
      p_items => json_build_array(json_build_object('product_id', v_prod, 'qty', v_stock + 5)),
      p_bank => null);
    v_err := 'NO_RAISE';
  exception when others then v_err := SQLERRM; end;
  select coalesce(stock_quantity, 0) into v_after from public.bar_products where id = v_prod;
  if v_err <> 'insufficient_stock' then v_fail := v_fail || ' oversell_got=' || v_err; end if;
  if v_after <> v_stock            then v_fail := v_fail || format(' stock_changed %s->%s', v_stock, v_after); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL stock_nonneg_guard%', v_fail;
  else raise exception 'SUITE_PASS stock_nonneg_guard oversell_blocked stock_intact'; end if;
end $d$;
