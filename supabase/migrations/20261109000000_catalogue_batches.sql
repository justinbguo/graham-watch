-- The New tab: the watches the latest full catalogue refresh put on the deck.
--
-- Each full nightly refresh seals one batch, keyed by that process's run id.
-- A watch belongs to at most one batch, ever, so it is new once. The app
-- reads the newest batch through latest_catalogue_batch and never touches
-- the batch tables.
--
-- listing_on_deck is the guest catalogue predicate. The guest listing policy,
-- the seal, and the read all call it, so they cannot drift apart. The signed-in
-- policy is unchanged: it also lets a shop owner read their own unpublished
-- watches, which is why New filters with listing_on_deck instead of trusting
-- whatever the caller's policy shows.

create function public.listing_on_deck(p_listing public.listings)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_listing.status = 'active'
    and p_listing.sold_at is null
    and public.listing_gallery_ready(p_listing.id)
    and exists (
      select 1
      from public.dealers d
      where d.id = p_listing.dealer_id
        and d.permission = 'approved'
    );
$$;

revoke all on function public.listing_on_deck(public.listings) from public;
grant execute on function public.listing_on_deck(public.listings) to anon, authenticated, service_role;

drop policy "approved catalogue is readable before sign-in" on public.listings;
create policy "approved catalogue is readable before sign-in"
on public.listings for select to anon
using (public.listing_on_deck(listings));

create table public.catalogue_batches (
  id uuid primary key,
  sealed_at timestamptz not null default now(),
  listing_count integer not null
);

create index catalogue_batches_sealed_at_idx on public.catalogue_batches (sealed_at desc);

create table public.catalogue_batch_listings (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  batch_id uuid not null references public.catalogue_batches (id) on delete cascade
);

create index catalogue_batch_listings_batch_id_idx on public.catalogue_batch_listings (batch_id);

-- Closed to every client role. Only the two definer functions below read or
-- write these rows, so a buyer cannot list batch membership directly.
alter table public.catalogue_batches enable row level security;
alter table public.catalogue_batch_listings enable row level security;
revoke all on public.catalogue_batches from public, anon, authenticated, service_role;
revoke all on public.catalogue_batch_listings from public, anon, authenticated, service_role;

-- Security definer: the batch tables grant nothing to service_role, so the
-- refresh job can only write them through this function. The advisory lock
-- keeps a cron run and a manual dispatch from interleaving their inserts.
-- Calling it twice with one run id returns the first call's batch.
create function public.seal_catalogue_batch(p_batch_id uuid)
returns table (batch_id uuid, listing_count integer, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  inserted integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.catalogue_batches'));

  if exists (select 1 from public.catalogue_batches b where b.id = p_batch_id) then
    return query
      select b.id, b.listing_count, false
      from public.catalogue_batches b
      where b.id = p_batch_id;
    return;
  end if;

  insert into public.catalogue_batches (id, listing_count) values (p_batch_id, 0);

  insert into public.catalogue_batch_listings (listing_id, batch_id)
  select l.id, p_batch_id
  from public.listings l
  where public.listing_on_deck(l)
    and l.created_at > now() - interval '7 days'
  on conflict (listing_id) do nothing;
  get diagnostics inserted = row_count;

  update public.catalogue_batches b
  set listing_count = inserted
  where b.id = p_batch_id;

  return query select p_batch_id, inserted, true;
end;
$$;

revoke all on function public.seal_catalogue_batch(uuid) from public, anon, authenticated;
grant execute on function public.seal_catalogue_batch(uuid) to service_role;

-- Security definer: the batch tables grant nothing to anon or authenticated.
-- Members are filtered with listing_on_deck, so a caller learns only ids a
-- guest could already read. Zero rows means no batch was ever sealed. One row
-- with an empty array means the latest refresh published nothing still on
-- the deck.
create function public.latest_catalogue_batch()
returns table (batch_id uuid, sealed_at timestamptz, listing_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.sealed_at,
    coalesce(
      (
        select array_agg(l.id order by l.created_at desc, l.id desc)
        from public.catalogue_batch_listings m
        join public.listings l on l.id = m.listing_id
        where m.batch_id = b.id
          and public.listing_on_deck(l)
      ),
      '{}'::uuid[]
    )
  from (
    select c.id, c.sealed_at
    from public.catalogue_batches c
    order by c.sealed_at desc, c.id desc
    limit 1
  ) b;
$$;

revoke all on function public.latest_catalogue_batch() from public;
grant execute on function public.latest_catalogue_batch() to anon, authenticated, service_role;
