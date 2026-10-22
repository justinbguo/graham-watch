-- A claimed shop may delete its own catalogue rows. Cascades take photos,
-- swipes, and inquiries with the listing — same cost as operator delete.
grant delete on table public.listings to authenticated;

create policy "shop owners delete their listings"
on public.listings for delete to authenticated
using (public.controls_dealer(dealer_id));
