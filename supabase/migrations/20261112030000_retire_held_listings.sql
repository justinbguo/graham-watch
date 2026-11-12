-- A held catalogue row is not a watch. The importer already refuses to publish
-- one, and a row that reached the deck before the hold still has an active
-- listing. The next availability sweep marks that listing sold. A dealer who
-- marked it sold themselves keeps that mark.
--
-- not_a_watch is not cleared when the shop still lists the product. The hold
-- is the decision, and the product staying in the feed is expected.

alter table public.listings drop constraint listings_sold_source_check;

alter table public.listings
  add constraint listings_sold_source_check
  check (
    sold_source is null
    or sold_source in (
      'feed_unavailable',
      'missing_from_catalog',
      'dealer',
      'not_a_watch'
    )
  );

comment on column public.listings.sold_source is
  'Who decided the watch is sold. Null when for sale. dealer sticks across feed refreshes. feed_* may clear when the shop lists it again. not_a_watch sticks, because a held item staying in the feed is not a relist.';

create or replace function public.sync_source_availability(
  p_dealer_id uuid,
  p_seen_ids uuid[],
  p_read_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired integer := 0;
  relisted integer := 0;
  n integer;
begin
  if (select auth.uid()) is not null and not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  perform set_config('graham.sync', 'on', true);

  with judged as (
    select
      s.listing_id,
      s.available,
      l.sold_at as was_sold,
      l.sold_source as was_source
    from public.source_items s
    join public.listings l on l.id = s.listing_id
    where s.dealer_id = p_dealer_id
      and s.id = any (p_seen_ids)
  ),
  swept as (
    update public.listings l
    set
      availability_checked_at = now(),
      sold_at = case
        when not j.available and j.was_sold is null then now()
        when j.available
          and j.was_source in ('feed_unavailable', 'missing_from_catalog')
          then null
        else l.sold_at
      end,
      sold_source = case
        when not j.available and j.was_sold is null then 'feed_unavailable'
        when j.available
          and j.was_source in ('feed_unavailable', 'missing_from_catalog')
          then null
        else l.sold_source
      end
    from judged j
    where l.id = j.listing_id
    returning
      (not j.available and j.was_sold is null) as retired_now,
      (
        j.available
        and j.was_source in ('feed_unavailable', 'missing_from_catalog')
      ) as relisted_now
  )
  select
    count(*) filter (where retired_now),
    count(*) filter (where relisted_now)
  into retired, relisted
  from swept;

  if p_read_complete then
    with missing as (
      select s.listing_id
      from public.source_items s
      join public.listings l on l.id = s.listing_id
      where s.dealer_id = p_dealer_id
        and s.listing_id is not null
        and not (s.id = any (p_seen_ids))
        and l.sold_at is null
    ),
    gone as (
      update public.listings l
      set
        availability_checked_at = now(),
        sold_at = now(),
        sold_source = 'missing_from_catalog'
      from missing m
      where l.id = m.listing_id
      returning 1
    )
    select count(*) into n from gone;
    retired := retired + coalesce(n, 0);
  end if;

  -- Held rows are still in the shop feed, so the sweep above leaves them for
  -- sale. Pull every held listing for this shop, including ones this page did
  -- not see, and do not touch a sale the dealer recorded.
  with held as (
    select s.listing_id
    from public.source_items s
    join public.listings l on l.id = s.listing_id
    where s.dealer_id = p_dealer_id
      and s.hold_reason is not null
      and l.sold_at is null
      and l.sold_source is distinct from 'dealer'
  ),
  withdrawn as (
    update public.listings l
    set
      availability_checked_at = now(),
      sold_at = now(),
      sold_source = 'not_a_watch'
    from held h
    where l.id = h.listing_id
    returning 1
  )
  select count(*) into n from withdrawn;
  retired := retired + coalesce(n, 0);

  return jsonb_build_object('retired', retired, 'relisted', relisted);
end;
$$;

-- Keystone marks jewelry with "(Objet)" and a product type of Watches. A title
-- that also says watch (a lapel watch, a pendant watch) stays a watch. This
-- catches the rows already on the deck. Later reads use the same rule in the
-- importer, then the sweep above.
update public.source_items
set
  hold_reason = 'accessory',
  publish = false
where hold_reason is null
  and raw->>'title' ~* '\(\s*objet\s*\)'
  and raw->>'title' !~* '\mwatch(es)?\M';

update public.listings as l
set
  sold_at = now(),
  sold_source = 'not_a_watch'
from public.source_items as s
where s.listing_id = l.id
  and s.hold_reason = 'accessory'
  and s.raw->>'title' ~* '\(\s*objet\s*\)'
  and s.raw->>'title' !~* '\mwatch(es)?\M'
  and l.sold_at is null
  and l.sold_source is distinct from 'dealer';
