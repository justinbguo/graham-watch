-- Guests can browse the approved catalogue before they sign in. The deck opens
-- without an account; after a short local swipe budget the app asks them to
-- create one. Swipes, messages, and the exchange stay authenticated-only.
--
-- Anon already held column grants on dealers (names, websites, marks) from the
-- contact-privacy migration, but RLS had no policy for the role, so every row
-- was invisible. Functions were revoked from anon wholesale in
-- 20260917000001_revoke_anon_privileges.sql — search and counts need an
-- explicit grant back. Writes stay revoked.
--
-- drop if exists: local may already have these from an earlier pending apply.

drop policy if exists "approved catalogue is readable before sign-in" on public.listings;
create policy "approved catalogue is readable before sign-in"
on public.listings for select to anon
using (
  status = 'active'
  and sold_at is null
  and exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and d.permission = 'approved'
  )
);

drop policy if exists "photos of the public catalogue are readable before sign-in"
  on public.listing_photos;
create policy "photos of the public catalogue are readable before sign-in"
on public.listing_photos for select to anon
using (
  exists (
    select 1
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    where l.id = listing_id
      and l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
  )
);

drop policy if exists "dealers are readable before sign-in" on public.dealers;
create policy "dealers are readable before sign-in"
on public.dealers for select to anon
using (true);

grant execute on function public.search_listings(
  integer,
  integer,
  boolean,
  text,
  text,
  text[],
  public.watch_style[],
  public.case_material[],
  public.winding[],
  public.complication[],
  boolean,
  uuid[],
  integer[],
  integer[],
  numeric[],
  numeric[],
  integer[],
  integer[],
  boolean
) to anon;

grant execute on function public.listing_counts(
  boolean,
  text,
  text[],
  public.watch_style[],
  public.case_material[],
  public.winding[],
  public.complication[],
  uuid[],
  integer[],
  integer[],
  numeric[],
  numeric[],
  integer[],
  integer[],
  boolean
) to anon;

grant execute on function public.listing_facets(boolean) to anon;

grant execute on function public.get_deck(integer) to anon;
