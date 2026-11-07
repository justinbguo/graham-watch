-- Watches a shop's latest catalogue read actually added.
--
-- `dealers.last_sync_added` is how many catalogue rows (`source_items`) that
-- read had never seen. It is not a list, and it counts rows that never became
-- a listing. `source_items` is hidden from an operator once a shop is claimed
-- (`controls_dealer`), which is the common case after onboarding. The console
-- therefore cannot join the two tables itself and still see every shop.
--
-- A listing is new on that read when its catalogue row is one of the
-- `last_sync_added` rows with the latest `first_seen_at`, and that stamp falls
-- in the twelve hours before `last_synced_at`. Twelve hours keeps the previous
-- night's additions out. Two minutes after the stamp covers a clock that
-- records the row a moment after the shop. The rank includes catalogue rows
-- with no listing, so an unpublished row does not pull an older watch into
-- the list to fill the count.
--
-- No sync is `last_synced_at` null. The function returns nothing for that
-- shop, and nothing when the last read added zero. The console tells those
-- apart from the shop row it already has.

create function public.last_sync_additions(p_dealer_id uuid default null)
returns table (
  dealer_id uuid,
  listing_id uuid,
  added_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      s.dealer_id,
      s.listing_id,
      s.first_seen_at,
      row_number() over (
        partition by s.dealer_id
        order by s.first_seen_at desc, s.id
      ) as rn,
      d.last_sync_added
    from public.source_items s
    join public.dealers d on d.id = s.dealer_id
    where (p_dealer_id is null or s.dealer_id = p_dealer_id)
      and d.last_synced_at is not null
      and d.last_sync_added is not null
      and d.last_sync_added > 0
      and s.first_seen_at <= d.last_synced_at + interval '2 minutes'
      and s.first_seen_at > d.last_synced_at - interval '12 hours'
  )
  select ranked.dealer_id, ranked.listing_id, ranked.first_seen_at
  from ranked
  where ranked.rn <= ranked.last_sync_added
    and ranked.listing_id is not null;
$$;

revoke all on function public.last_sync_additions(uuid) from public, anon, authenticated, service_role;

comment on function public.last_sync_additions(uuid) is
  'Listings whose catalogue row was first seen on the shop''s latest sync. Not an API. operator_last_sync_counts and operator_last_sync_listings are the callers.';

create function public.operator_last_sync_counts()
returns table (
  dealer_id uuid,
  new_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    select a.dealer_id, count(*)::bigint
    from public.last_sync_additions(null) a
    group by a.dealer_id;
end;
$$;

revoke all on function public.operator_last_sync_counts() from public, anon;
grant execute on function public.operator_last_sync_counts() to authenticated, service_role;

create function public.operator_last_sync_listings(p_dealer_id uuid)
returns table (
  id uuid,
  brand text,
  model text,
  price_cents bigint,
  currency text,
  source_url text,
  shop_url text,
  thumb_path text,
  thumb_source_url text,
  added_at timestamptz
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
      l.brand,
      l.model,
      l.price_cents,
      l.currency,
      l.source_url,
      d.website,
      photo.storage_path,
      photo.source_url,
      a.added_at
    from public.last_sync_additions(p_dealer_id) a
    join public.listings l on l.id = a.listing_id
    join public.dealers d on d.id = a.dealer_id
    left join lateral (
      select p.storage_path, p.source_url
      from public.listing_photos p
      where p.listing_id = l.id
      order by p.position
      limit 1
    ) photo on true
    order by a.added_at desc, l.id;
end;
$$;

revoke all on function public.operator_last_sync_listings(uuid) from public, anon;
grant execute on function public.operator_last_sync_listings(uuid) to authenticated, service_role;
