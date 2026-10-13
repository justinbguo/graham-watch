-- A buyer can follow a shop. The list is theirs: it shows on their profile,
-- and nobody else's. Unfollow is a delete. There is no feed yet.

create table public.dealer_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, dealer_id)
);

alter table public.dealer_follows enable row level security;

create policy "you read your own follows"
on public.dealer_follows for select to authenticated
using (user_id = (select auth.uid()));

create policy "you follow as yourself"
on public.dealer_follows for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.dealers d
    where d.id = dealer_id and d.permission = 'approved'
  )
);

create policy "you unfollow your own"
on public.dealer_follows for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.dealer_follows from anon, public;
grant select, insert, delete on public.dealer_follows to authenticated;
