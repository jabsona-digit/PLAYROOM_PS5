-- 0011_refund_void
-- BACKFILLED from the live DB on 2026-06-13 (schema_migrations.statements,
-- original applied version 20260606182129). This migration ran in prod but its
-- file was never committed — restored verbatim so the repo can rebuild the
-- schema from scratch in dependency order. Do NOT re-apply to prod (already
-- applied). See memory accounting-schema-drift.


-- ============================================================
-- 0011: Refund / Void system
-- void_bar_sale()  — marks voided + restores stock + audit
-- refund_session() — marks refunded (completed sessions only) + audit
-- Accessible by owner / admin / manager; not cashier / operator.
-- ============================================================

-- 1. void columns on bar_sales
alter table public.bar_sales
  add column voided_at   timestamptz,
  add column void_reason text;

-- partial index — efficient filter for non-voided sales in cashier
create index bar_sales_voided_idx
  on public.bar_sales (org_id, voided_at)
  where voided_at is not null;

-- 2. refund columns on sessions
alter table public.sessions
  add column refunded_at    timestamptz,
  add column refund_reason  text,
  add column refund_amount  numeric;

create index sessions_refunded_idx
  on public.sessions (org_id, refunded_at)
  where refunded_at is not null;

-- 3. void_bar_sale()
create or replace function public.void_bar_sale(
  p_sale_id  uuid,
  p_reason   text default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
begin
  select org_id, venue_id
  into   v_org_id, v_venue_id
  from   public.bar_sales
  where  id = p_sale_id;

  if not found then
    raise exception 'not_found';
  end if;

  -- Must belong to current user's org or be platform admin
  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- Cashiers / operators cannot void
  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where  org_id  = v_org_id
        and  user_id = auth.uid()
        and  role in ('owner', 'admin', 'manager')
    ) then
      raise exception 'insufficient_privilege';
    end if;
  end if;

  -- Idempotency guard
  if exists (
    select 1 from public.bar_sales
    where id = p_sale_id and voided_at is not null
  ) then
    raise exception 'already_voided';
  end if;

  -- Mark voided
  update public.bar_sales
  set voided_at   = now(),
      void_reason = p_reason
  where id = p_sale_id;

  -- Restore stock for every item in the sale
  update public.bar_products bp
  set    stock_quantity = bp.stock_quantity + bsi.qty
  from   public.bar_sale_items bsi
  where  bsi.sale_id    = p_sale_id
    and  bsi.product_id = bp.id;

  -- Audit
  perform public.log_audit(
    v_org_id, v_venue_id,
    'bar_sale.void', 'bar_sale', p_sale_id::text,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.void_bar_sale(uuid, text) to authenticated;

-- 4. refund_session()
create or replace function public.refund_session(
  p_session_id    uuid,
  p_reason        text    default null,
  p_refund_amount numeric default null
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id   uuid;
  v_venue_id uuid;
  v_status   text;
  v_total    numeric;
begin
  select org_id, venue_id, status, price_total
  into   v_org_id, v_venue_id, v_status, v_total
  from   public.sessions
  where  id = p_session_id;

  if not found then
    raise exception 'not_found';
  end if;

  if not is_org_member(v_org_id) and not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  -- Cashiers / operators cannot refund
  if not is_platform_admin() then
    if not exists (
      select 1 from public.org_members
      where  org_id  = v_org_id
        and  user_id = auth.uid()
        and  role in ('owner', 'admin', 'manager')
    ) then
      raise exception 'insufficient_privilege';
    end if;
  end if;

  -- Only completed sessions can be refunded
  if v_status != 'completed' then
    raise exception 'session_not_completed';
  end if;

  -- Idempotency guard
  if exists (
    select 1 from public.sessions
    where id = p_session_id and refunded_at is not null
  ) then
    raise exception 'already_refunded';
  end if;

  update public.sessions
  set refunded_at   = now(),
      refund_reason = p_reason,
      refund_amount = coalesce(p_refund_amount, v_total)
  where id = p_session_id;

  perform public.log_audit(
    v_org_id, v_venue_id,
    'session.refund', 'session', p_session_id::text,
    jsonb_build_object(
      'reason',        p_reason,
      'refund_amount', coalesce(p_refund_amount, v_total),
      'price_total',   v_total
    )
  );
end;
$$;

grant execute on function public.refund_session(uuid, text, numeric) to authenticated;
