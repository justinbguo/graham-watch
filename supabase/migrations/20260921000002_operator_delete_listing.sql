-- Deleting an imported watch, and saying what that costs before it happens.
--
-- Until now an operator could add watches and pull a whole shop back, but a
-- single bad import — the model read a strap page as a watch, the photos came
-- out wrong — had no exit. Hiding it was the reversible option and was not
-- chosen: a listing nobody will ever publish is clutter in every count on the
-- console, and the catalogue row it came from is the real record of the
-- dealer's stock.
--
-- What a delete takes with it, via `on delete cascade` from 20260911000001:
-- the gallery rows, every swipe including the right swipes that are somebody's
-- saved watch, and any inquiry a buyer sent about it. That is not recoverable,
-- so `operator_listings` now carries the two counts that make the confirmation
-- honest — a watch three people saved is a different decision from one nobody
-- has seen.

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
  thumb_path text,
  saved_count bigint,
  inquiry_count bigint
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
      ),
      -- A save is a right swipe; there is no second table. See the deck rules.
      (
        select count(*)
        from public.swipes s
        where s.listing_id = l.id and s.direction = 'right'
      ),
      (select count(*) from public.inquiries i where i.listing_id = l.id)
    from public.listings l
    where l.dealer_id = p_dealer_id
    order by l.created_at desc;
end;
$$;

revoke execute on function public.operator_listings(uuid) from public;
grant execute on function public.operator_listings(uuid) to authenticated, service_role;

/**
 * Deletes one imported watch and hands back the files it owned.
 *
 * Returns the storage paths rather than deleting them here, because storage
 * refuses a direct delete from SQL — 20260920000002 is the migration that
 * learned this, when a definer function deleting an avatar row raised 42501
 * and rolled back the whole account deletion. The caller removes the files
 * through the Storage API as the service role, which is also the only identity
 * that ever wrote to that bucket.
 *
 * The catalogue row survives with `listing_id` set to null by the foreign key,
 * and is reset here so the watch can be imported again. Without clearing
 * `applied_hash` the row still matches its content fingerprint, so the publish
 * queue would skip it forever: it would sit in the picker looking importable
 * and quietly do nothing when chosen.
 */
create function public.operator_delete_listing(p_listing_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
  item uuid;
begin
  perform public.require_operator();

  select array_remove(array_agg(p.storage_path), null)
    into paths
  from public.listing_photos p
  where p.listing_id = p_listing_id;

  -- Read before the delete: the foreign key nulls this the moment the listing
  -- goes, and then there is nothing left to point back at the catalogue row.
  select s.id into item
  from public.source_items s
  where s.listing_id = p_listing_id;

  delete from public.listings where id = p_listing_id;

  if not found then
    raise exception 'No such watch.';
  end if;

  if item is not null then
    update public.source_items
    set publish = false,
        applied_hash = null,
        photos_hash = null,
        error = null
    where id = item;
  end if;

  return coalesce(paths, array[]::text[]);
end;
$$;

revoke execute on function public.operator_delete_listing(uuid) from public, anon;
grant execute on function public.operator_delete_listing(uuid) to authenticated, service_role;
