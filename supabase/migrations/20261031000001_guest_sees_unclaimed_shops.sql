-- A signed-out buyer has no account, so auth.uid() is null. "This shop is
-- unclaimed" is also null. `is distinct from` treats those two nulls as the
-- same person, and the Buy tab then hid every unclaimed shop — including one
-- that had just been approved and had live watches. A guest has imported
-- nothing and claimed nothing, so exclude-own has nothing to exclude.

create or replace function public.discovery_visible_to_caller(
  p_exclude_own boolean,
  p_imported_by uuid,
  p_dealer_claimed_by uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    not p_exclude_own
    or (select auth.uid()) is null
    or (
      p_imported_by is distinct from (select auth.uid())
      and p_dealer_claimed_by is distinct from (select auth.uid())
    );
$$;
