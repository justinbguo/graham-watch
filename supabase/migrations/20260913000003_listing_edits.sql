-- A claimed shop can read its own listings, including the ones it removed from
-- the catalogue, but the photo policy still only answered for the importer. The
-- shop's own inventory list showed rows with no photograph.
drop policy "photos follow their listing" on public.listing_photos;

create policy "photos follow their listing"
on public.listing_photos for select to authenticated
using (
  exists (
    select 1
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    where l.id = listing_id
      and (
        l.imported_by = (select auth.uid())
        or d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
        or (l.status = 'active' and d.permission = 'approved')
      )
  )
);

create extension if not exists unaccent with schema extensions;

-- brand is printed as the dealer wrote it; brand_key is what filters and groups.
-- Mirrors brandKey() in supabase/functions/import-listings/taxonomy.ts.
create function public.brand_key(p_brand text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(extensions.unaccent(p_brand)), '[^a-z0-9]', '', 'g'), '');
$$;

-- A dealer editing the brand by hand sends no brand_key, and a stale key drops
-- the watch out of every brand filter and facet count.
--
-- Only fills a key the writer did not set: the importer sends both, having
-- already run the brand through its alias table ("Vacheron & Constantin" to
-- "Vacheron Constantin"). A hand-typed brand gets no alias pass, so a dealer who
-- spells a brand a second way makes a second facet.
create function public.set_listing_brand_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.brand_key is null then
      new.brand_key := public.brand_key(new.brand);
    end if;
  elsif new.brand is distinct from old.brand
    and new.brand_key is not distinct from old.brand_key then
    new.brand_key := public.brand_key(new.brand);
  end if;

  return new;
end;
$$;

create trigger listings_brand_key
before insert or update of brand on public.listings
for each row
execute function public.set_listing_brand_key();
