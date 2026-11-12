-- A guest opens a shop from a listing before they have an account. The panel
-- asks for dealer_reputation, and that function was granted only to signed-in
-- users, so every listing logged a 401 and the shop's figures never appeared.
--
-- The figures for an approved shop are the same counts a guest can already
-- infer from the deck. An unapproved shop stays hidden unless the caller
-- manages it.

create or replace function public.dealer_reputation(p_dealer_id uuid)
returns table (
  joined_at timestamptz,
  listings_live integer,
  watches_sold integer,
  last_refreshed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.created_at,
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and l.status = 'active'
        and l.sold_at is null
    )::integer,
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and l.sold_at is not null
    )::integer,
    coalesce(
      d.last_synced_at,
      (
        select max(l.availability_checked_at)
        from public.listings l
        where l.dealer_id = d.id
      )
    )
  from public.dealers d
  where d.id = p_dealer_id
    and (
      d.permission = 'approved'
      or public.controls_dealer(d.id)
    );
$$;

revoke all on function public.dealer_reputation(uuid) from public;
grant execute on function public.dealer_reputation(uuid) to anon, authenticated, service_role;
