-- operator_dealers() called a column listings_live and counted active, unsold
-- rows. The deck also requires the shop to be approved (see search_listings in
-- 20260912000011), so a pending shop reported watches as live when a buyer
-- could see none of them — on the very screen used to decide whether to publish
-- it. The same omission was a bug in dealer_reputation before it.
--
-- Renamed as well as fixed. "live" invited the guess; these two say what they
-- count, and the pair is the whole publish decision: in_deck is what a buyer
-- sees now, held is what publishing would expose.

drop function public.operator_dealers();

create function public.operator_dealers()
returns table (
  id uuid,
  name text,
  website text,
  contact_email text,
  permission public.dealer_permission,
  claimed_by uuid,
  created_at timestamptz,
  listings_held bigint,
  listings_in_deck bigint
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
      d.website,
      d.contact_email,
      d.permission,
      d.claimed_by,
      d.created_at,
      count(l.id),
      -- The shop-level half of the deck's own predicate. What it leaves out is
      -- per-viewer — a buyer never sees what they imported or already swiped —
      -- and so cannot be counted per shop.
      count(l.id) filter (
        where l.status = 'active'
          and l.sold_at is null
          and d.permission = 'approved'
      )
    from public.dealers d
    left join public.listings l on l.dealer_id = d.id
    group by d.id
    order by d.created_at desc;
end;
$$;

revoke execute on function public.operator_dealers() from public;
grant execute on function public.operator_dealers() to authenticated, service_role;
