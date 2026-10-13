/**
 * Replaces a listing's gallery in one statement.
 *
 * The import deleted then inserted from the edge function with neither result
 * checked. That went wrong two ways:
 *
 * 1. A dealer who claimed a shop they did not import is not the listing's
 *    `imported_by`, so "importers write photos on their listings" denied both
 *    writes. The refresh still reported success and left the gallery stale.
 * 2. A failure between the delete and the insert left the listing live with no
 *    photographs. `search_listings` does not join photos, so that watch still
 *    reaches the deck — as a card with nothing on it.
 *
 * Definer because the caller may own the shop without having imported it, which
 * is the normal case after a claim. Ownership is re-checked against the dealer,
 * the same test `apply_source_item` makes.
 */
create function public.replace_listing_photos(p_listing_id uuid, p_photos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  written integer;
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    where l.id = p_listing_id
      and (l.imported_by = actor or d.claimed_by = actor or d.created_by = actor)
  ) then
    raise exception 'You do not manage that listing.' using errcode = '42501';
  end if;

  delete from public.listing_photos where listing_id = p_listing_id;

  -- listing_id comes from the argument, never from the payload, so a caller
  -- cannot write a gallery onto someone else's listing through this array.
  insert into public.listing_photos (listing_id, source_url, storage_path, position)
  select
    p_listing_id,
    photo ->> 'source_url',
    photo ->> 'storage_path',
    (photo ->> 'position')::integer
  from jsonb_array_elements(p_photos) as photo;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function public.replace_listing_photos(uuid, jsonb) from public;
grant execute on function public.replace_listing_photos(uuid, jsonb) to authenticated;
