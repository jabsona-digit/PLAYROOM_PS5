-- 0097 - Money-correctness audit fixes (pre-onboarding hardening).
--
-- F1: stock could still go negative. The 7-arg create_bar_sale(uuid,text,text,jsonb,...)
--     deducts stock with NO check, and it is the function the In-Seat PAY-NOW path calls
--     (resolve_service_request). The 0089/0090 work only covered the on-tab + order-time
--     paths. Rather than rewrite the (Georgian-stringed) function, guard at the DATA layer:
--     a trigger that blocks ANY update driving stock below 0 (covers every path, present
--     and future). Existing negatives are clamped to 0 first.
-- F2: end_session(uuid) (1-arg) is an orphaned overload — it completes an OPEN session
--     WITHOUT recomputing price_total (revenue = 0) and has NO auth guard. With both
--     overloads present, a 1-arg call is also ambiguous. Drop it; the good
--     end_session(uuid,numeric) then serves every call (p_tip defaults to 0).

-- F1 --------------------------------------------------------------------------
update public.bar_products set stock_quantity = 0 where stock_quantity < 0;

create or replace function public.guard_nonneg_stock()
returns trigger
language plpgsql
as $$
begin
  raise exception 'insufficient_stock' using detail = 'stock_quantity cannot go below zero';
end;
$$;

drop trigger if exists trg_guard_nonneg_stock on public.bar_products;
create trigger trg_guard_nonneg_stock
  before update on public.bar_products
  for each row
  when (new.stock_quantity is not null and new.stock_quantity < 0)
  execute function public.guard_nonneg_stock();

-- F2 --------------------------------------------------------------------------
drop function if exists public.end_session(uuid);
