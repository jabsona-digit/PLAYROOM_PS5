-- 0098 - cash_expected accuracy (cash drawer / Z-report reconciliation).
--
-- The drawer's "expected cash" = opening + cash IN - cash OUT during [opened_at, closed_at].
-- Two fixes vs the old version:
--   S1 (timing): a FIXED session's cash is collected at START (prepaid), an OPEN session's
--      at END. The old code attributed BOTH by ended_at, so a fixed session that started in
--      one shift and ended in the next showed up in the wrong drawer -> false discrepancies
--      at shift handover. Now: fixed -> started_at, open -> ended_at.
--   S2 (refunds): a cash refund leaves the drawer but wasn't subtracted; the old code just
--      excluded refunded sessions entirely, which is only correct for a full refund in the
--      same window (partial / cross-shift refunds drifted). Now: count ALL cash-in by
--      collection time, then subtract cash refunds by refunded_at.

create or replace function public.cash_expected(
  p_venue_id uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_opening  numeric
)
returns numeric
language sql
security definer
set search_path = public
as $function$
  select round(coalesce(p_opening, 0)
    -- session cash IN: fixed collected at start, open collected at end
    + coalesce((select sum(price_total + coalesce(tip_amount, 0))
        from public.sessions
        where venue_id = p_venue_id and payment_method = 'cash' and status = 'completed'
          and (case when is_open then ended_at else started_at end) between p_from and p_to), 0)
    -- bar cash IN
    + coalesce((select sum(total + coalesce(tip_amount, 0))
        from public.bar_sales
        where venue_id = p_venue_id and payment_method = 'cash'
          and voided_at is null and created_at between p_from and p_to), 0)
    -- cash refunds OUT (paid back from the drawer) during the window
    - coalesce((select sum(coalesce(refund_amount, price_total))
        from public.sessions
        where venue_id = p_venue_id and payment_method = 'cash'
          and refunded_at is not null and refunded_at between p_from and p_to), 0)
  , 2);
$function$;
