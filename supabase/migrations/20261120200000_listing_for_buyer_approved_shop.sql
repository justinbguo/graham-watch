create or replace function public.listing_for_buyer(p_listing public.listings)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not (
      coalesce(p_listing.brand_key, '') like 'rolex%'
      or lower(btrim(p_listing.brand)) ~ '^rolex([^a-z]|$)'
    )
    and (p_listing.year is null or p_listing.year <= 1985)
    and exists (
      select 1
      from public.dealers d
      where d.id = p_listing.dealer_id
        and d.permission = 'approved'
    );
$$;
