alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.swipes enable row level security;
alter table public.import_jobs enable row level security;

create policy "profiles are readable when signed in"
on public.profiles for select to authenticated
using (true);

create policy "own profile is writable"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "active listings are readable when signed in"
on public.listings for select to authenticated
using (status = 'active' or seller_id = (select auth.uid()));

create policy "sellers write their own listings"
on public.listings for all to authenticated
using (seller_id = (select auth.uid()))
with check (seller_id = (select auth.uid()));

create policy "photos follow their listing"
on public.listing_photos for select to authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (l.status = 'active' or l.seller_id = (select auth.uid()))
  )
);

create policy "sellers write photos on their listings"
on public.listing_photos for all to authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id and l.seller_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.listings l
    where l.id = listing_id and l.seller_id = (select auth.uid())
  )
);

create policy "swipes are private"
on public.swipes for all to authenticated
using (actor_id = (select auth.uid()))
with check (actor_id = (select auth.uid()));

create policy "import jobs are private"
on public.import_jobs for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
