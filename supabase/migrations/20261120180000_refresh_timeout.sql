-- The 20 Nov 2026 catalogue refresh canceled three statements and the job
-- stayed green. Postgres logged the statements.
--
-- Danny's (dannysvintagewatches.com), inside sync_source_availability:
--   not (s.id = any (p_seen_ids))
-- on the missing-from-catalog update. A uuid array of the whole catalogue
-- cannot use source_items_dealer_idx, so the sweep read the shop's rows
-- to find the few that were absent.
--
-- Goldfinger's and Good Evening, the first page of the hash read:
--   select id, external_id, content_hash
--   from source_items
--   where dealer_id = $1
--   order by id
--   limit 1000
-- source_items_dealer_idx is (dealer_id, last_seen_at desc). It cannot
-- return rows in id order, so the plan read the shop and sorted it.
-- (dealer_id, id) serves that page.

create index source_items_dealer_id_idx
  on public.source_items (dealer_id, id)
  include (external_id, content_hash);

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
  read_stamp timestamptz;
  read_stamp_end timestamptz;
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
    -- The nightly read stamps every seen row with one last_seen_at. Absence
    -- is then "older than that stamp", which source_items_dealer_idx can
    -- range-scan. A caller that passes ids without one shared stamp still
    -- uses the id list. That list is the path that timed out on Danny's.
    select min(s.last_seen_at), max(s.last_seen_at)
      into read_stamp, read_stamp_end
    from public.source_items s
    where s.dealer_id = p_dealer_id
      and s.id = any (p_seen_ids);

    if read_stamp is not null and read_stamp = read_stamp_end then
      with missing as (
        select s.listing_id
        from public.source_items s
        join public.listings l on l.id = s.listing_id
        where s.dealer_id = p_dealer_id
          and s.listing_id is not null
          and s.last_seen_at < read_stamp
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
    else
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
    end if;
    retired := retired + coalesce(n, 0);
  end if;

  -- Held rows are still in the shop feed, so the sweep above leaves them for
  -- sale. Pull every held listing for this shop, including ones this page did
  -- not see.
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
