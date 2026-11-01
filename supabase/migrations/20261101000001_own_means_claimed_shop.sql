-- "Own" listings in discovery means listings from a shop the caller has claimed,
-- not listings the caller imported (the catalogue importer stamps imported_by).
create or replace function public.discovery_visible_to_caller(
  p_exclude_own boolean, p_imported_by uuid, p_dealer_claimed_by uuid)
returns boolean language sql stable set search_path to ''
as $$
  select not p_exclude_own
    or (select auth.uid()) is null
    or p_dealer_claimed_by is distinct from (select auth.uid());
$$;
