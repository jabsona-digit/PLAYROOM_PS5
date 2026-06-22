-- Money-correctness invariant tests (P0-2 / P0-3 of the senior review).
--
-- These are ROLLBACK-STYLE tests: each DO block sets up data, exercises the money
-- RPCs, asserts the invariant, then RAISES to roll the whole thing back — so running
-- this file NEVER mutates real data (the trailing "ERROR: RESULT_x …" is the assertion
-- output, not a failure). Run each block via the Management API query endpoint (or psql)
-- as documented in memory/migration-apply-method.md. Demo org/venue/owner UUIDs are used.
--
-- Until these are wired into CI against a staging branch (P0-2 + P1-1), re-run them by
-- hand after touching any tournament/credit/session money path. Expected RESULT lines are
-- noted under each block.

-- ── A) award_tournament_prizes: idempotent + money-out reconciles ─────────────
-- EXPECT: payouts=3 | expenses_sum=280.00 | credit_min=60 | idempotency=OK:already_awarded
do $a$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_t uuid; m record; v_final uuid; v_bronze uuid; v_third uuid;
  v_res jsonb; v_idem text; v_pay int; v_exp_sum numeric; v_cred_min int;
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
  v_res := public.award_tournament_prizes(v_t);
  begin perform public.award_tournament_prizes(v_t); v_idem := 'FAIL-not-idempotent';
  exception when others then v_idem := 'OK:' || SQLERRM; end;
  select count(*) into v_pay from public.tournament_payouts where tournament_id = v_t;
  select coalesce(sum(amount), 0) into v_exp_sum from public.expenses where venue_id = v_venue and description like '%RECON_A%';
  select coalesce(sum(minutes), 0) into v_cred_min from public.customer_credits where tournament_id = v_t;
  raise exception 'RESULT_A payouts=% | expenses_sum=% | credit_min=% | idempotency=%', v_pay, v_exp_sum, v_cred_min, v_idem;
end $a$;

-- ── B) apply_credit_to_session: no double-redeem; minutes_used never doubles ───
-- EXPECT: price=10.00 | credit_used=60 | status=redeemed | double_apply=OK:credit_already_applied
do $b$
declare
  v_owner uuid := 'bc2afd0f-dc14-4e0f-b073-cfe1d98344cc';
  v_org   uuid := 'f5bdf043-9e6a-4efd-928c-109aead87dfb';
  v_venue uuid := 'c95108ec-8b43-4c18-b228-483584788ec8';
  v_plan int; v_sess uuid; v_cred uuid; v_code text; v_cust uuid := gen_random_uuid();
  v_r1 jsonb; v_dbl text; v_pt numeric; v_used int; v_status text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select id into v_plan from public.pricing_plans where org_id = v_org and is_active limit 1;
  insert into public.sessions (console_id, pricing_plan_id, org_id, venue_id, price_per_hour, price_total, duration_min, is_open, status, started_at, ended_at)
    values (71, v_plan, v_org, v_venue, 10, 20, 120, false, 'completed', now() - interval '2 hours', now()) returning id into v_sess;
  insert into public.customer_credits (org_id, venue_id, customer_id, source, minutes, note)
    values (v_org, v_venue, v_cust, 'tournament_prize', 60, 'recon B') returning id into v_cred;
  select code into v_code from public.customer_credits where id = v_cred;
  v_r1 := public.apply_credit_to_session(v_sess, v_code);
  begin perform public.apply_credit_to_session(v_sess, v_code); v_dbl := 'FAIL-double-applied';
  exception when others then v_dbl := 'OK:' || SQLERRM; end;
  select price_total into v_pt from public.sessions where id = v_sess;
  select minutes_used, status into v_used, v_status from public.customer_credits where id = v_cred;
  raise exception 'RESULT_B price=% | credit_used=% | status=% | double_apply=%', v_pt, v_used, v_status, v_dbl;
end $b$;
