-- The description a buyer reads is the one field of an imported watch nobody
-- could check in the console. Brand, reference and price are short enough to
-- scan in a row and were all the table returned; the prose the model wrote from
-- the shop's page was only visible by opening the listing in the app.
--
-- That is the field most likely to be wrong. A model call turns a shop's page
-- into a description, and a bad read produces a sentence about a strap or about
-- the shop's shipping policy, sitting under a photograph of a watch.
--
-- Return type changes need a drop: CREATE OR REPLACE refuses to alter the
-- OUT columns of an existing function.
drop function public.operator_listings(uuid);

create function public.operator_listings(p_dealer_id uuid)
returns table (
  id uuid,
  source_url text,
  brand text,
  model text,
  reference text,
  year integer,
  case_size_mm numeric,
  condition text,
  description text,
  price_cents bigint,
  currency text,
  status public.listing_status,
  sold_at timestamptz,
  created_at timestamptz,
  photo_count bigint,
  thumb_path text
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
      l.id,
      l.source_url,
      l.brand,
      l.model,
      l.reference,
      l.year,
      l.case_size_mm,
      l.condition,
      l.description,
      l.price_cents,
      l.currency,
      l.status,
      l.sold_at,
      l.created_at,
      (select count(*) from public.listing_photos p where p.listing_id = l.id),
      (
        select p.storage_path
        from public.listing_photos p
        where p.listing_id = l.id
        order by p.position
        limit 1
      )
    from public.listings l
    where l.dealer_id = p_dealer_id
    order by l.created_at desc;
end;
$$;

revoke execute on function public.operator_listings(uuid) from public;
grant execute on function public.operator_listings(uuid) to authenticated, service_role;
