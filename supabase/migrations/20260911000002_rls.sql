alter table public.profiles enable row level security;
alter table public.dealers enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.swipes enable row level security;
alter table public.import_jobs enable row level security;
alter table public.inquiries enable row level security;

create policy "profiles are readable when signed in"
on public.profiles for select to authenticated
using (true);

create policy "own profile is writable"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Dealer names and links are shown on every card, so reading is open. Approval
-- is deliberately not writable from the app: a user who could approve their own
-- import could publish any shop's inventory without permission. Approving runs
-- through the dashboard, which bypasses RLS with the service role.
create policy "dealers are readable when signed in"
on public.dealers for select to authenticated
using (true);

create policy "anyone signed in can add a pending dealer"
on public.dealers for insert to authenticated
with check (created_by = (select auth.uid()) and permission = 'pending');

-- Only approved dealers reach other users. Your own imports stay visible to you
-- while permission is pending so you can see what the importer produced.
create policy "approved listings are readable when signed in"
on public.listings for select to authenticated
using (
  imported_by = (select auth.uid())
  or (
    status = 'active'
    and exists (
      select 1 from public.dealers d
      where d.id = dealer_id and d.permission = 'approved'
    )
  )
);

create policy "importers write their own listings"
on public.listings for all to authenticated
using (imported_by = (select auth.uid()))
with check (imported_by = (select auth.uid()));

create policy "photos follow their listing"
on public.listing_photos for select to authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (
        l.imported_by = (select auth.uid())
        or (
          l.status = 'active'
          and exists (
            select 1 from public.dealers d
            where d.id = l.dealer_id and d.permission = 'approved'
          )
        )
      )
  )
);

create policy "importers write photos on their listings"
on public.listing_photos for all to authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id and l.imported_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.listings l
    where l.id = listing_id and l.imported_by = (select auth.uid())
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

-- An inquiry is a record of contacting a dealer. A buyer may create and read
-- their own; nothing in the app edits or deletes one.
create policy "buyers read their own inquiries"
on public.inquiries for select to authenticated
using (buyer_id = (select auth.uid()));

create policy "buyers create their own inquiries"
on public.inquiries for insert to authenticated
with check (buyer_id = (select auth.uid()) and status = 'pending');
