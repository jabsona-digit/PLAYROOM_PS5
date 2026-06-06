-- God Mode: per-tenant overview for the platform console. security_invoker, so
-- a platform_admin (who passes RLS on every table) sees ALL orgs; a normal user
-- would only see their own org's row (harmless).
create view public.platform_org_overview with (security_invoker = true) as
select
  o.id,
  o.name,
  o.plan,
  o.subscription_status,
  o.trial_ends_at,
  o.created_at,
  (select count(*) from public.org_members m where m.org_id = o.id) as member_count,
  (select count(*) from public.venues v where v.org_id = o.id)      as venue_count,
  coalesce((select sum(s.price_total) from public.sessions s
              where s.org_id = o.id and s.status = 'completed'), 0)
  + coalesce((select sum(b.total) from public.bar_sales b where b.org_id = o.id), 0)
    as total_revenue
from public.organizations o
order by o.created_at desc;
