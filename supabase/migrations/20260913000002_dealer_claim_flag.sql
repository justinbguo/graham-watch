-- SQL equality with null returns null. The client needs a real false value to
-- distinguish an eligible unclaimed shop from an owned one.
create or replace function public.dealer_accounts()
returns table (
  id uuid,
  name text,
  website text,
  permission public.dealer_permission,
  claimed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.name,
    d.website,
    d.permission,
    coalesce(d.claimed_by = (select auth.uid()), false)
  from public.dealers d
  join auth.users u on u.id = (select auth.uid())
  where d.claimed_by = (select auth.uid())
     or (
       d.claimed_by is null
       and d.contact_email is not null
       and lower(trim(d.contact_email)) = lower(trim(u.email))
     )
  order by d.name;
$$;
