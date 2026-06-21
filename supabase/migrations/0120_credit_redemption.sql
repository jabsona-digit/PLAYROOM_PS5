-- 0120 - Tournament credit REDEMPTION at the venue (cashier). The 3rd-place prize
-- (free play-time, customer_credits, 0119) is now USABLE: after a session ends, the operator
-- enters/scans the player's credit code and the free minutes DISCOUNT the play charge.
--
-- Design: applied AFTER the session is completed (price_total final), as a discount that
-- REDUCES sessions.price_total -> it flows into cash_expected / get_venue_pnl / reconcile_shift
-- automatically (forgone revenue = the free time we gave away; NOT an expense, never double
-- counted). end_session is untouched. Venue-scoped: a credit can only be spent at its own org.
-- ASCII only.

-- ── 1) schema: stamp the applied credit on the session; short code on the credit ─
alter table public.sessions
  add column if not exists credit_id       uuid,
  add column if not exists credit_minutes  int not null default 0,
  add column if not exists credit_discount numeric not null default 0;

alter table public.customer_credits
  add column if not exists code text;
-- short human-typable redeem code (the QR still carries the full id as 'MTLC:<id>')
update public.customer_credits set code = upper(substr(translate(gen_random_uuid()::text, '-', ''), 1, 6))
  where code is null;
alter table public.customer_credits
  alter column code set default upper(substr(translate(gen_random_uuid()::text, '-', ''), 1, 6));

-- ── 2) apply_credit_to_session: operator redeems free minutes against an ENDED session ─
create or replace function public.apply_credit_to_session(p_session_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_status text; v_is_open boolean; v_dur int; v_pph numeric; v_price numeric;
  v_existing uuid;
  v_cred record; v_q text; v_billable int; v_free int; v_raw numeric; v_disc numeric; v_consumed int;
begin
  select org_id, status, is_open, coalesce(duration_min, 0), coalesce(price_per_hour, 0),
         coalesce(price_total, 0), credit_id
    into v_org, v_status, v_is_open, v_dur, v_pph, v_price, v_existing
    from public.sessions where id = p_session_id;
  if v_org is null then raise exception 'session_not_found'; end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_status <> 'completed' then raise exception 'session_not_ended'; end if;
  if v_existing is not null then raise exception 'credit_already_applied'; end if;

  v_q := btrim(coalesce(p_code, ''));
  if v_q ilike 'MTLC:%' then v_q := substr(v_q, 6); end if;
  if v_q = '' then raise exception 'code_required'; end if;

  select * into v_cred from public.customer_credits c
   where c.org_id = v_org and c.status = 'active'
     and (c.id::text = v_q or upper(c.code) = upper(v_q))
   order by c.created_at limit 1;
  if v_cred.id is null then raise exception 'credit_not_found'; end if;

  if v_cred.minutes - v_cred.minutes_used <= 0 then raise exception 'credit_exhausted'; end if;

  -- free play-time discounts the PLAY charge only (price_total), capped by what they actually played
  v_billable := greatest(0, v_dur);
  v_free := least(v_cred.minutes - v_cred.minutes_used, v_billable);
  if v_free <= 0 then raise exception 'nothing_to_discount'; end if;

  v_raw  := round(v_free / 60.0 * v_pph, 2);
  v_disc := least(v_raw, v_price);
  -- if the play charge caps the discount (rare: custom fixed price), only consume the minutes paid for
  v_consumed := case when v_raw <= v_price or v_pph <= 0 then v_free
                     else least(v_free, ceil(v_price / v_pph * 60.0)::int) end;

  update public.sessions
     set price_total  = round(greatest(0, v_price - v_disc), 2),
         credit_id    = v_cred.id,
         credit_minutes = v_consumed,
         credit_discount = v_disc
   where id = p_session_id;

  update public.customer_credits
     set minutes_used = minutes_used + v_consumed,
         status = case when minutes_used + v_consumed >= minutes then 'redeemed' else 'active' end
   where id = v_cred.id;

  return jsonb_build_object('ok', true, 'minutes', v_consumed, 'discount', v_disc,
    'remaining', greatest(0, v_cred.minutes - v_cred.minutes_used - v_consumed),
    'note', v_cred.note, 'new_total', round(greatest(0, v_price - v_disc), 2));
end; $$;
revoke all on function public.apply_credit_to_session(uuid, text) from public, anon;
grant execute on function public.apply_credit_to_session(uuid, text) to authenticated;

-- ── 3) remove_credit_from_session: undo a mis-applied credit (restore minutes + price) ─
create or replace function public.remove_credit_from_session(p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_cid uuid; v_min int; v_disc numeric;
begin
  select org_id, credit_id, coalesce(credit_minutes, 0), coalesce(credit_discount, 0)
    into v_org, v_cid, v_min, v_disc
    from public.sessions where id = p_session_id;
  if v_org is null then raise exception 'session_not_found'; end if;
  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_cid is null then raise exception 'no_credit_applied'; end if;

  update public.sessions
     set price_total = round(price_total + v_disc, 2), credit_id = null,
         credit_minutes = 0, credit_discount = 0
   where id = p_session_id;

  update public.customer_credits
     set minutes_used = greatest(0, minutes_used - v_min), status = 'active'
   where id = v_cid;

  return jsonb_build_object('ok', true, 'restored_minutes', v_min, 'restored_amount', v_disc);
end; $$;
revoke all on function public.remove_credit_from_session(uuid) from public, anon;
grant execute on function public.remove_credit_from_session(uuid) to authenticated;

-- ── 4) get_my_credits v2: expose the short redeem code (for /account display) ─────
create or replace function public.get_my_credits()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'minutes', c.minutes, 'minutes_used', c.minutes_used,
      'remaining', greatest(0, c.minutes - c.minutes_used), 'status', c.status,
      'note', c.note, 'venue_name', v.name, 'venue_city', v.city,
      'created_at', c.created_at, 'expires_at', c.expires_at
    ) order by c.created_at desc)
    from public.customer_credits c
    left join public.venues v on v.id = c.venue_id
    where c.customer_id = v_uid and c.status = 'active'
  ), '[]'::jsonb);
end; $$;
revoke all on function public.get_my_credits() from public, anon;
grant execute on function public.get_my_credits() to authenticated;

-- ── 5) compute_session_bill v3: 0096 (with tab_extension) + surface credit_discount ─
create or replace function public.compute_session_bill(p_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_is_open boolean; v_started timestamptz; v_pph numeric; v_ended timestamptz; v_price numeric;
  v_play numeric; v_play_paid boolean; v_cred_disc numeric;
  v_paid jsonb; v_paid_total numeric; v_tab jsonb; v_tab_total numeric;
  v_ext_tab numeric;
begin
  select is_open, started_at, price_per_hour, ended_at, price_total, coalesce(credit_discount, 0)
    into v_is_open, v_started, v_pph, v_ended, v_price, v_cred_disc
  from public.sessions where id = p_session_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  if v_is_open and v_ended is null then
    v_play := round(least(1440, greatest(5, ceil(extract(epoch from (now() - v_started)) / 300.0)::int * 5)) / 60.0 * v_pph, 2);
    v_play_paid := false;
  else
    v_play := coalesce(v_price, 0);
    v_play_paid := not v_is_open;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', bi.name, 'qty', bi.qty, 'line_total', bi.line_total) order by bi.id), '[]'::jsonb),
         coalesce(sum(bi.line_total), 0)
    into v_paid, v_paid_total
  from public.bar_sales bs
  join public.bar_sale_items bi on bi.sale_id = bs.id
  where bs.session_id = p_session_id and bs.voided_at is null and bs.payment_method is not null;

  select coalesce(jsonb_agg(jsonb_build_object('name', it->>'name', 'qty', (it->>'qty')::int, 'line_total', (it->>'line_total')::numeric)), '[]'::jsonb),
         coalesce(sum((it->>'line_total')::numeric), 0)
    into v_tab, v_tab_total
  from public.service_requests sr
  cross join lateral jsonb_array_elements(sr.items) it
  where sr.session_id = p_session_id and sr.kind = 'order' and sr.status = 'delivered';

  -- owed time-extensions (on tab, not yet settled) -> red
  select coalesce(sum(extra_price), 0) into v_ext_tab
  from public.session_extensions
  where session_id = p_session_id and on_tab and settled_at is null;

  return jsonb_build_object(
    'is_open', v_is_open,
    'play_amount', v_play, 'play_paid', v_play_paid,
    'credit_discount', round(v_cred_disc, 2),
    'paid_items', v_paid, 'paid_bar_total', round(v_paid_total, 2),
    'tab_items', v_tab, 'tab_total', round(v_tab_total, 2),
    'tab_extension', round(v_ext_tab, 2),
    'green_total', round((case when v_play_paid then v_play else 0 end) + v_paid_total, 2),
    'red_total',   round((case when v_play_paid then 0 else v_play end) + v_tab_total + v_ext_tab, 2),
    'grand_total', round(v_play + v_paid_total + v_tab_total + v_ext_tab, 2)
  );
end; $$;
revoke all on function public.compute_session_bill(uuid) from public, anon, authenticated;
