-- The dealer panel showed a rating, a review count, years trading and a reply
-- time, all invented and seeded off the dealer id so they at least held still.
-- Two of those are facts we already hold and one is derivable; the rating is
-- not, because nothing in this schema is a review. An invented figure printed
-- beside true ones is worse than four honest blanks, so the rating is gone
-- rather than dressed up.
--
-- security definer so the figures do not change with who is looking. Read as
-- the caller, a shop's own operator would count listings it has hidden from the
-- catalogue and a buyer would not, and the same shop would show two sizes.
create function public.dealer_reputation(p_dealer_id uuid)
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
    -- Only sales we actually observed: a watch that left the shop's feed marked
    -- gone, or one the dealer retired by hand. It undercounts anything sold
    -- before we started reading the shop, which is the honest direction to err.
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and l.sold_at is not null
    )::integer,
    -- What a buyer is really asking when they look at a shop's figures: is any
    -- of this current?
    (
      select max(l.availability_checked_at)
      from public.listings l
      where l.dealer_id = d.id
    )
  from public.dealers d
  where d.id = p_dealer_id;
$$;

revoke execute on function public.dealer_reputation(uuid) from public;
grant execute on function public.dealer_reputation(uuid) to authenticated;
