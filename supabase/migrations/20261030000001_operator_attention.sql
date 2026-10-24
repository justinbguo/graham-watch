-- What the operator console reads when it asks "what needs a person?"
--
-- refresh_runs is not granted to signed-in users. The nightly script inserts
-- with the service role; operator_dealers already shows the latest row per
-- shop. History — every shop in a night, including the ones that failed — is
-- a different question, and a table read would hand the ledger to anyone
-- the grant was later widened for. operator_refresh_runs is the door.
--
-- operator_stale_listings is the other half of a listing problem. Photo gaps
-- are already on operator_dealers. A live watch whose availability has not
-- been checked for 48 hours is not: one missed night is the refresh banner,
-- and the listing itself is flagged once a second night has passed. A null
-- check is stale immediately. It has never been confirmed.
--
-- The file is dated after 20261029000005 on purpose. `supabase migration new`
-- stamps the wall clock, and that clock is behind the timestamps already in
-- this directory. A 20261024 file would run before refresh_runs exists.

create function public.operator_refresh_runs(p_limit integer default 400)
returns table (
  id uuid,
  dealer_id uuid,
  dealer_name text,
  website text,
  finished_at timestamptz,
  ok boolean,
  skipped boolean,
  fatal boolean,
  error text,
  found integer,
  changed integer,
  added integer,
  retired integer,
  relisted integer,
  published integer,
  skipped_listings integer,
  pending integer,
  complete boolean,
  http_status integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  capped integer := least(greatest(coalesce(p_limit, 400), 1), 1000);
begin
  perform public.require_operator();

  return query
    select
      r.id,
      r.dealer_id,
      d.name,
      d.website,
      r.finished_at,
      r.ok,
      r.skipped,
      r.fatal,
      r.error,
      r.found,
      r.changed,
      r.added,
      r.retired,
      r.relisted,
      r.published,
      r.skipped_listings,
      r.pending,
      r.complete,
      r.http_status
    from public.refresh_runs r
    join public.dealers d on d.id = r.dealer_id
    order by r.finished_at desc, d.name
    limit capped;
end;
$$;

revoke all on function public.operator_refresh_runs(integer) from public, anon;
grant execute on function public.operator_refresh_runs(integer) to authenticated, service_role;

comment on function public.operator_refresh_runs(integer) is
  'Recent nightly refresh rows for the operator console. Operators only. The table itself stays closed.';

create function public.operator_stale_listings()
returns table (
  dealer_id uuid,
  name text,
  stale_count bigint,
  oldest_checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    select
      d.id,
      d.name,
      count(*)::bigint,
      min(l.availability_checked_at)
    from public.dealers d
    join public.listings l on l.dealer_id = d.id
    where d.permission = 'approved'
      and l.status = 'active'
      and l.sold_at is null
      and (
        l.availability_checked_at is null
        or l.availability_checked_at < now() - interval '48 hours'
      )
    group by d.id, d.name
    having count(*) > 0
    order by count(*) desc, d.name;
end;
$$;

revoke all on function public.operator_stale_listings() from public, anon;
grant execute on function public.operator_stale_listings() to authenticated, service_role;

comment on function public.operator_stale_listings() is
  'Approved shops with live watches whose availability has not been checked for 48 hours, or has never been checked. Operators only.';
