-- 0110 - Tournaments 2.0 Phase 3 polish: post the pay-at-venue ENTRY FEE into bar_sales
-- so it flows into EVERY revenue surface automatically (cash drawer / cash_expected, P&L /
-- get_venue_pnl, monthly_pnl view, reconcile_shift, VAT, daily brief, org overview, staff
-- leaderboard) instead of living only on tournament_registrations. One insert = no black hole.
--
-- A new bar_sales.source marks these ('tournament' vs the default 'bar'). The PRO plan gate
-- is relaxed to ONLY guard real bar sales, so a TRIAL host's live check-in never fails.
-- Georgian appears in the line-item label, so apply via the manual-escape path.

-- 1) tag the revenue source
alter table public.bar_sales add column if not exists source text not null default 'bar';
alter table public.tournament_registrations add column if not exists sale_id uuid;

-- 2) relax the PRO gate: only 'bar' sales require the bar/POS plan; entry fees are exempt
create or replace function public.gate_bar_sale_plan()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.source, 'bar') = 'bar' then
    perform public.require_plan(new.org_id, 'pro');
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_bar_sale on public.bar_sales;
create trigger trg_plan_bar_sale before insert on public.bar_sales
  for each row execute function public.gate_bar_sale_plan();

-- 3) check-in v2: collect the fee at the venue AND post it as paid revenue
create or replace function public.checkin_tournament_registration(p_registration uuid, p_method text, p_amount numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_venue uuid; v_t uuid; v_status text; v_name text; v_phone text; v_fee numeric;
        v_tname text; v_already boolean := false; v_paid numeric; v_method text; v_sale uuid;
begin
  select r.tournament_id, r.status, r.display_name, r.phone, t.org_id, t.venue_id, t.entry_fee, t.name
    into v_t, v_status, v_name, v_phone, v_org, v_venue, v_fee, v_tname
    from public.tournament_registrations r
    join public.tournaments t on t.id = r.tournament_id
    where r.id = p_registration;
  if v_t is null then raise exception 'registration_not_found'; end if;
  if not public.is_org_member(v_org) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if v_status = 'cancelled' then raise exception 'registration_cancelled'; end if;

  if v_status = 'checked_in' then
    v_already := true;
    select paid_amount into v_paid from public.tournament_registrations where id = p_registration;
  else
    v_paid := coalesce(p_amount, v_fee);
    v_method := coalesce(nullif(p_method, ''), 'cash');

    -- post the entry fee as paid venue revenue (only when there is something to collect
    -- and the tournament actually has a host venue)
    if coalesce(v_paid, 0) > 0 and v_venue is not null then
      insert into public.bar_sales (org_id, venue_id, total, payment_method, customer_name, created_by_user, source)
        values (v_org, v_venue, v_paid, v_method, v_name, auth.uid(), 'tournament')
        returning id into v_sale;
      insert into public.bar_sale_items (org_id, sale_id, name, unit_price, qty, line_total, unit_cost_price)
        values (v_org, v_sale, 'ტურნირის საწევრო: ' || v_tname, v_paid, 1, v_paid, 0);
    end if;

    update public.tournament_registrations
      set status = 'checked_in', paid_method = v_method, paid_amount = v_paid,
          paid_at = now(), checked_in_at = now(), sale_id = v_sale
      where id = p_registration;
  end if;

  return jsonb_build_object('ok', true, 'already', v_already, 'display_name', v_name,
    'phone', v_phone, 'status', 'checked_in', 'paid_amount', v_paid, 'tournament', v_tname);
end; $$;
revoke all on function public.checkin_tournament_registration(uuid, text, numeric) from public, anon;
grant execute on function public.checkin_tournament_registration(uuid, text, numeric) to authenticated;
