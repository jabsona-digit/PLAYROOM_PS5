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
-- no-double-redeem + minutes cap + one-way status; min_participants draw gate
-- (anti-loss); create_bar_sale method/bank validation (0099); non-negative stock guard;
-- end_session 5-min round-up + 1440 cap (P1-3); cash_expected shift reconciliation
-- (cash-only, card excluded, refund subtracted) (P1-3); settle_session_tab -> exactly
-- one paid bar_sale equal to the itemized tab + idempotent (P1-3); 5% marketplace
-- commission base (P1-3).
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
  -- pin past the dynamic-pricing BEFORE-INSERT trigger so the rate/total are deterministic
  update public.sessions set price_per_hour = 10, price_total = 20, duration_min = 120 where id = v_sess;
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

-- @@TEST tournament_min_participants_gate
-- draw_tournament_groups (0114) must REFUSE to draw when checked-in participants are
-- below min_participants (anti-loss: don't run a paid tournament that can't fill).
do $e$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_t uuid; v_err text; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.tournaments (org_id, venue_id, name, game, format, status, entry_fee, prize_pool, min_participants)
    values (v_org, v_venue, 'MIN_GATE_E', 'FC', 'groups_knockout', 'registration', 0, 0, 4) returning id into v_t;
  insert into public.tournament_participants (tournament_id, org_id, name)
    values (v_t, v_org, 'P1'), (v_t, v_org, 'P2');  -- only 2, below min 4
  begin perform public.draw_tournament_groups(v_t); v_err := 'NO_RAISE';
  exception when others then v_err := SQLERRM; end;
  if v_err not like 'below_minimum:%' then v_fail := v_fail || ' draw_got=' || v_err; end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL tournament_min_participants_gate%', v_fail;
  else raise exception 'SUITE_PASS tournament_min_participants_gate draw_blocked(%)', v_err; end if;
end $e$;

-- @@TEST end_session_rounding_cap
-- Open-session billing = ceil to 5-min, floor 5, cap 1440 (24h). 11 min @ ₾12/h must
-- bill 15 min = ₾3.00 (rounds UP); 30 h @ ₾10/h must cap at 1440 min = ₾240.00.
-- Uses an isolated console_type so capacity is clean for sessions that are active "now".
do $f$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_con int; v_s1 uuid; v_s2 uuid;
  v_d1 int; v_p1 numeric; v_d2 int; v_p2 numeric; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  insert into public.consoles (org_id, venue_id, slot_number, name, console_type, status)
    values (v_org, v_venue, 9990, 'inv-end', 'ZZINV_END', 'active') returning id into v_con;
  -- rounds UP: 11 min -> 15 min, ₾3.00
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, is_open, status, started_at)
    values (v_con, v_plan, v_org, v_venue, 12, 0, true, 'active', now() - interval '11 minutes') returning id into v_s1;
  -- pin the rate past the dynamic-pricing BEFORE-INSERT trigger (an active happy-hour rule
  -- in the demo org would otherwise rewrite price_per_hour and make this test time-dependent)
  update public.sessions set price_per_hour = 12 where id = v_s1;
  perform public.end_session(v_s1, 0);
  select duration_min, price_total into v_d1, v_p1 from public.sessions where id = v_s1;
  -- caps: 30 h -> 1440 min, ₾240.00
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, is_open, status, started_at)
    values (v_con, v_plan, v_org, v_venue, 10, 0, true, 'active', now() - interval '30 hours') returning id into v_s2;
  update public.sessions set price_per_hour = 10 where id = v_s2;
  perform public.end_session(v_s2, 0);
  select duration_min, price_total into v_d2, v_p2 from public.sessions where id = v_s2;
  if v_d1 <> 15     then v_fail := v_fail || format(' dur1=%s(exp15)', v_d1); end if;
  if v_p1 <> 3.00   then v_fail := v_fail || format(' price1=%s(exp3)', v_p1); end if;
  if v_d2 <> 1440   then v_fail := v_fail || format(' dur2=%s(exp1440)', v_d2); end if;
  if v_p2 <> 240.00 then v_fail := v_fail || format(' price2=%s(exp240)', v_p2); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL end_session_rounding_cap%', v_fail;
  else raise exception 'SUITE_PASS end_session_rounding_cap 11min->15/3.00 30h->1440/240'; end if;
end $f$;

-- @@TEST cash_expected_reconciliation
-- Drawer expected = opening + cash session-in (fixed by start-time) + bar cash - cash
-- refunds. A CARD session must NOT count; a refunded cash session nets to 0 (counted in,
-- then refunded out). Far-past window (500d ago) so no real data pollutes the sum.
do $g$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_con int;
  f timestamptz := now() - interval '500 days';
  t timestamptz := now() - interval '500 days' + interval '2 hours';
  v_exp numeric; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  select id into v_con from public.consoles where venue_id = v_venue and deleted_at is null order by id limit 1;
  -- cash fixed session ₾20 (collected at start, in window)
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at, payment_method)
    values (v_con, v_plan, v_org, v_venue, 10, 20, 120, false, 'completed', f + interval '30 min', f + interval '90 min', 'cash');
  -- card session ₾50 (must NOT count toward cash)
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at, payment_method, bank)
    values (v_con, v_plan, v_org, v_venue, 10, 50, 300, false, 'completed', f + interval '30 min', f + interval '90 min', 'card', 'TBC');
  -- refunded cash session ₾15 (+15 in by start, then -15 out by refunded_at) => net 0
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at, payment_method, refunded_at, refund_amount)
    values (v_con, v_plan, v_org, v_venue, 10, 15, 90, false, 'completed', f + interval '50 min', f + interval '70 min', 'cash', f + interval '60 min', 15);
  -- bar cash ₾10 (in window)
  insert into public.bar_sales (org_id, venue_id, total, tip_amount, payment_method, created_at)
    values (v_org, v_venue, 10, 0, 'cash', f + interval '45 min');
  select public.cash_expected(v_venue, f, t, 100) into v_exp;
  -- 100 + (20 + 15) + 10 - 15 = 130
  if v_exp <> 130.00 then v_fail := v_fail || format(' expected=%s(exp130)', v_exp); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL cash_expected_reconciliation%', v_fail;
  else raise exception 'SUITE_PASS cash_expected_reconciliation expected=130 (card-excluded, refund-netted)'; end if;
end $g$;

-- @@TEST settle_tab_single_sale
-- settle_session_tab must charge the whole delivered tab as EXACTLY ONE paid bar_sale
-- equal to the sum of the delivered order requests, mark them 'settled', and be
-- idempotent (a second call rings up nothing and leaves exactly one sale).
do $h$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_con int; v_prod int; v_sess uuid; v_r jsonb;
  v_total numeric; v_sales int; v_sale_total numeric; v_items_sum numeric; v_delivered int; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  select id into v_con  from public.consoles where venue_id = v_venue and deleted_at is null order by id limit 1;
  select id into v_prod from public.bar_products where org_id = v_org order by id limit 1;
  if v_prod is null then raise exception 'SUITE_FAIL settle_tab_single_sale no_demo_product'; end if;
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at)
    values (v_con, v_plan, v_org, v_venue, 10, 20, 120, false, 'completed', now() - interval '380 days', now() - interval '380 days' + interval '2 hours') returning id into v_sess;
  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, status, total, items)
    values (v_org, v_venue, v_con, v_sess, 'order', 'delivered', 12,
            json_build_array(json_build_object('product_id', v_prod, 'name', 'Item A', 'unit_price', 6, 'qty', 2, 'line_total', 12))::jsonb);
  insert into public.service_requests (org_id, venue_id, console_id, session_id, kind, status, total, items)
    values (v_org, v_venue, v_con, v_sess, 'order', 'delivered', 8,
            json_build_array(json_build_object('product_id', v_prod, 'name', 'Item B', 'unit_price', 4, 'qty', 2, 'line_total', 8))::jsonb);
  select public.settle_session_tab(v_sess, 'cash', null) into v_r;
  v_total := (v_r->>'settled_total')::numeric;
  -- second call must be a no-op (nothing left delivered) and must NOT create a 2nd sale
  perform public.settle_session_tab(v_sess, 'cash', null);
  select count(*), coalesce(sum(total), 0) into v_sales, v_sale_total
    from public.bar_sales where session_id = v_sess and customer_name = 'In-Seat Tab';
  select coalesce(sum(bi.line_total), 0) into v_items_sum
    from public.bar_sales bs join public.bar_sale_items bi on bi.sale_id = bs.id
    where bs.session_id = v_sess;
  select count(*) filter (where status = 'delivered') into v_delivered
    from public.service_requests where session_id = v_sess;
  if v_total      <> 20    then v_fail := v_fail || format(' settled_total=%s(exp20)', v_total); end if;
  if v_sales      <> 1     then v_fail := v_fail || format(' sales=%s(exp1)', v_sales); end if;
  if v_sale_total <> 20    then v_fail := v_fail || format(' sale_total=%s(exp20)', v_sale_total); end if;
  if v_items_sum  <> 20    then v_fail := v_fail || format(' items_sum=%s(exp20)', v_items_sum); end if;
  if v_delivered  <> 0     then v_fail := v_fail || format(' still_delivered=%s(exp0)', v_delivered); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL settle_tab_single_sale%', v_fail;
  else raise exception 'SUITE_PASS settle_tab_single_sale one_sale=20 items=20 idempotent'; end if;
end $h$;

-- @@TEST marketplace_commission_5pct
-- create_marketplace_booking must set total_amount = round(pph*min/60,2) and
-- commission_amount = round(total*0.05,2). Plan ₾10/h × 120 min => ₾20.00 total, ₾1.00
-- commission. Far-future start so the availability check has clear capacity.
do $i$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_bk uuid; v_total numeric; v_comm numeric; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select public.create_marketplace_booking(
    p_slug => 'gamelounge', p_start => now() + interval '400 days', p_duration_min => 120,
    p_customer_name => 'InvTest', p_customer_phone => '555000111',
    p_console_type => 'standard', p_pricing_plan_id => 2) into v_bk;
  select total_amount, commission_amount into v_total, v_comm
    from public.marketplace_bookings where id = v_bk;
  if v_total <> 20.00 then v_fail := v_fail || format(' total=%s(exp20)', v_total); end if;
  if v_comm  <> 1.00  then v_fail := v_fail || format(' commission=%s(exp1)', v_comm); end if;
  if v_comm  <> round(v_total * 0.05, 2) then v_fail := v_fail || ' commission<>5pct_of_total'; end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL marketplace_commission_5pct%', v_fail;
  else raise exception 'SUITE_PASS marketplace_commission_5pct total=20 commission=1 (5%%)'; end if;
end $i$;

-- @@TEST open_tier_change_segment_billing
-- Open session mid-session tier change (0140) must BANK the played time at the OLD rate
-- into open_accrued, then bill the rest at the NEW rate — never re-price past time.
-- 11 min @ ₾10/h -> banked roundup5=15min=₾2.50; then 12 min @ ₾20/h -> 15min=₾5.00;
-- end_session total = ₾7.50. (Backward-compat for no-change open sessions is covered by
-- end_session_rounding_cap above, which still passes with open_accrued=0.)
do $j$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_con int; v_p1 int; v_p2 int; v_sess uuid; v_r jsonb;
  v_banked numeric; v_accrued numeric; v_price numeric; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  insert into public.org_members (org_id, user_id, role) values (v_org, v_owner, 'owner') on conflict do nothing;
  insert into public.consoles (org_id, venue_id, slot_number, name, console_type, status)
    values (v_org, v_venue, 9991, 'inv-tier', 'ZZINV_TIER', 'active') returning id into v_con;
  insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour, is_active)
    values (v_org, 'INV_A', 'standard', 2, 10, true) returning id into v_p1;
  insert into public.pricing_plans (org_id, name, type, controllers, price_per_hour, is_active)
    values (v_org, 'INV_B', 'premium', 4, 20, true) returning id into v_p2;
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, is_open, status, started_at)
    values (v_con, v_p1, v_org, v_venue, 10, 0, true, 'active', now() - interval '11 minutes') returning id into v_sess;
  -- pin the opening rate past the dynamic-pricing BEFORE-INSERT trigger
  update public.sessions set price_per_hour = 10 where id = v_sess;
  -- change tier -> bank the 15-min (roundup) segment @ ₾10 = ₾2.50, re-anchor, rate -> ₾20
  select public.change_session_tier(v_sess, v_p2) into v_r;
  v_banked := (v_r->>'banked')::numeric;
  select open_accrued into v_accrued from public.sessions where id = v_sess;
  -- simulate 12 min played at the new ₾20 rate, then close
  update public.sessions set open_anchor_at = now() - interval '12 minutes' where id = v_sess;
  perform public.end_session(v_sess, 0);
  select price_total into v_price from public.sessions where id = v_sess;
  if v_banked  <> 2.50 then v_fail := v_fail || format(' banked=%s(exp2.50)', v_banked); end if;
  if v_accrued <> 2.50 then v_fail := v_fail || format(' accrued=%s(exp2.50)', v_accrued); end if;
  if v_price   <> 7.50 then v_fail := v_fail || format(' final=%s(exp7.50)', v_price); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL open_tier_change_segment_billing%', v_fail;
  else raise exception 'SUITE_PASS open_tier_change_segment_billing banked=2.50 final=7.50 (no past re-price)'; end if;
end $j$;

-- @@TEST early_end_actual_fixed
-- venues.early_end_actual (0141): a FIXED 60-min @ ₾6/h block ended after 10 min must bill
-- the ACTUAL 10 min = ₾1.00 when the venue opted IN; the same early-end with the flag OFF
-- bills the full booked ₾6.00 (today's behavior). Capped at booked either way.
do $k$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_con int; v_s_on uuid; v_s_off uuid; v_p_on numeric; v_p_off numeric; v_fail text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  insert into public.consoles (org_id, venue_id, slot_number, name, console_type, status)
    values (v_org, v_venue, 9994, 'inv-ee', 'ZZINV_EE', 'active') returning id into v_con;

  -- flag ON: early end bills actual (10 min @ ₾6 = ₾1.00)
  update public.venues set early_end_actual = true where id = v_venue;
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ends_at)
    values (v_con, v_plan, v_org, v_venue, 6, 6, 60, false, 'active', now() - interval '10 minutes', now() + interval '50 minutes') returning id into v_s_on;
  update public.sessions set price_per_hour = 6, price_total = 6 where id = v_s_on;  -- pin past dynamic pricing
  perform public.end_session(v_s_on, 0);
  select price_total into v_p_on from public.sessions where id = v_s_on;

  -- flag OFF: same early end bills the full booked ₾6.00
  update public.venues set early_end_actual = false where id = v_venue;
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ends_at)
    values (v_con, v_plan, v_org, v_venue, 6, 6, 60, false, 'active', now() - interval '10 minutes', now() + interval '50 minutes') returning id into v_s_off;
  update public.sessions set price_per_hour = 6, price_total = 6 where id = v_s_off;
  perform public.end_session(v_s_off, 0);
  select price_total into v_p_off from public.sessions where id = v_s_off;

  if v_p_on  <> 1.00 then v_fail := v_fail || format(' on=%s(exp1.00)', v_p_on); end if;
  if v_p_off <> 6.00 then v_fail := v_fail || format(' off=%s(exp6.00)', v_p_off); end if;
  if v_fail <> '' then raise exception 'SUITE_FAIL early_end_actual_fixed%', v_fail;
  else raise exception 'SUITE_PASS early_end_actual_fixed on=1.00 off=6.00 (capped at booked)'; end if;
end $k$;
