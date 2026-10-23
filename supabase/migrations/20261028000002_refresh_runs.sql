-- What the nightly refresh did, per shop, and what the operator console
-- reads instead of opening the database.
--
-- The catalogue columns on dealers (last_synced_at, last_sync_*) are the
-- last site read. They do not say how many listings the publish step
-- actually shipped, how many it skipped, or whether a live watch has no
-- photograph. Those are a different question, and they need a row per run
-- so "nothing new for a week" is a count rather than a guess.
--
-- The table is not granted to signed-in users. The refresh script inserts
-- with the service role. Operators read the latest row through
-- operator_dealers(), which already checks the operators table.

create table public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  skipped boolean not null default false,
  fatal boolean not null default false,
  error text,
  found integer not null default 0,
  changed integer not null default 0,
  added integer not null default 0,
  retired integer not null default 0,
  relisted integer not null default 0,
  published integer not null default 0,
  skipped_listings integer not null default 0,
  pending integer not null default 0,
  complete boolean,
  http_status integer
);

create index refresh_runs_dealer_finished_idx
  on public.refresh_runs (dealer_id, finished_at desc);

alter table public.refresh_runs enable row level security;

revoke all on table public.refresh_runs from public, anon, authenticated;
grant select, insert on table public.refresh_runs to service_role;

comment on table public.refresh_runs is
  'One row per shop per nightly refresh. Service role writes it; operators read the latest row through operator_dealers().';

-- ---------------------------------------------------------------------------
-- Pause is only a step down from published
-- ---------------------------------------------------------------------------

create or replace function public.set_dealer_permission(
  p_dealer_id uuid,
  p_permission public.dealer_permission
)
returns public.dealer_permission
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.dealer_permission;
  current public.dealer_permission;
begin
  perform public.require_operator();

  select d.permission into current
  from public.dealers d
  where d.id = p_dealer_id;

  if current is null then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;

  -- Pending and revoked shops are already out of the deck. Pausing them
  -- would make Resume look like it publishes a shop that was never approved.
  if p_permission = 'paused' and current is distinct from 'approved' then
    raise exception 'Only a published shop can be paused.' using errcode = '22023';
  end if;

  update public.dealers d
  set permission = p_permission
  where d.id = p_dealer_id
  returning d.permission into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Photographs on live watches
-- ---------------------------------------------------------------------------

/**
 * Active, unsold watches and how many stored photographs they have.
 *
 * Not an API. operator_dealers and catalogue_photo_gaps are the callers,
 * and both run as the owner of this function. Execute is revoked from
 * everyone else so a buyer cannot list another shop's gaps.
 */
create function public.listing_photo_counts()
returns table (
  dealer_id uuid,
  published_listings bigint,
  photo_count bigint,
  missing_photos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.dealer_id,
    count(*)::bigint,
    coalesce(sum(pc.n), 0)::bigint,
    count(*) filter (where coalesce(pc.n, 0) = 0)::bigint
  from public.listings l
  left join (
    select listing_id, count(*)::bigint as n
    from public.listing_photos
    group by listing_id
  ) pc on pc.listing_id = l.id
  where l.status = 'active'
    and l.sold_at is null
  group by l.dealer_id;
$$;

revoke all on function public.listing_photo_counts() from public, anon, authenticated, service_role;

/**
 * Approved shops whose live watches include at least one with no photograph.
 *
 * The nightly job prints these. Paused and revoked shops are absent on
 * purpose: they are not in the deck, and the console still shows their
 * photo counts through operator_dealers.
 */
create function public.catalogue_photo_gaps()
returns table (
  dealer_id uuid,
  name text,
  website text,
  published_listings bigint,
  photo_count bigint,
  missing_photos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.name,
    d.website,
    c.published_listings,
    c.photo_count,
    c.missing_photos
  from public.dealers d
  join public.listing_photo_counts() c on c.dealer_id = d.id
  where d.permission = 'approved'
    and c.missing_photos > 0;
$$;

revoke all on function public.catalogue_photo_gaps() from public, anon, authenticated;
grant execute on function public.catalogue_photo_gaps() to service_role;

-- ---------------------------------------------------------------------------
-- Operator console: last refresh and photo gaps beside the catalogue
-- ---------------------------------------------------------------------------

drop function public.operator_dealers();

create function public.operator_dealers()
returns table (
  id uuid,
  name text,
  website text,
  contact_email text,
  permission public.dealer_permission,
  claimed_by uuid,
  created_at timestamptz,
  listings_held bigint,
  listings_in_deck bigint,
  catalog_total bigint,
  catalog_queued bigint,
  catalog_failed bigint,
  can_import boolean,
  last_synced_at timestamptz,
  last_sync_complete boolean,
  last_sync_error text,
  last_sync_found integer,
  last_sync_added integer,
  last_sync_changed integer,
  last_sync_retired integer,
  last_sync_relisted integer,
  last_refresh_at timestamptz,
  last_refresh_published integer,
  last_refresh_skipped integer,
  last_refresh_error text,
  photo_count bigint,
  listings_missing_photos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    with listing_counts as (
      select
        l.dealer_id,
        count(*) as held,
        count(*) filter (where l.status = 'active' and l.sold_at is null) as sellable
      from public.listings l
      group by l.dealer_id
    ),
    catalog_counts as (
      select
        s.dealer_id,
        count(*) filter (where s.available) as total,
        count(*) filter (
          where s.publish and s.listing_id is null and s.error is null
        ) as queued,
        count(*) filter (where s.error is not null) as failed
      from public.source_items s
      group by s.dealer_id
    ),
    latest_run as (
      select distinct on (r.dealer_id)
        r.dealer_id,
        r.finished_at,
        r.published,
        r.skipped_listings,
        r.error
      from public.refresh_runs r
      order by r.dealer_id, r.finished_at desc
    )
    select
      d.id,
      d.name,
      d.website,
      d.contact_email,
      d.permission,
      d.claimed_by,
      d.created_at,
      coalesce(lc.held, 0),
      case when d.permission = 'approved' then coalesce(lc.sellable, 0) else 0 end,
      coalesce(cc.total, 0),
      coalesce(cc.queued, 0),
      coalesce(cc.failed, 0),
      public.controls_dealer(d.id),
      d.last_synced_at,
      d.last_sync_complete,
      d.last_sync_error,
      d.last_sync_found,
      d.last_sync_added,
      d.last_sync_changed,
      d.last_sync_retired,
      d.last_sync_relisted,
      lr.finished_at,
      lr.published,
      lr.skipped_listings,
      lr.error,
      coalesce(photos.photo_count, 0),
      coalesce(photos.missing_photos, 0)
    from public.dealers d
    left join listing_counts lc on lc.dealer_id = d.id
    left join catalog_counts cc on cc.dealer_id = d.id
    left join latest_run lr on lr.dealer_id = d.id
    left join public.listing_photo_counts() photos on photos.dealer_id = d.id
    order by d.created_at desc;
end;
$$;

revoke execute on function public.operator_dealers() from public, anon;
grant execute on function public.operator_dealers() to authenticated, service_role;
