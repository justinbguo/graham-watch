-- Catalogue freshness: evidence-based sold detection, and the columns a
-- nightly refresh needs so the operator console can see whether a shop is stale.
--
-- Sold used to mean "seen in this read and the shop said unavailable". That is
-- right for an incomplete catalogue (the 1000-item cap), and wrong for a
-- complete one where the watch has simply left the feed. Nightly auto-publish
-- needs the second rule without inventing sales from truncated reads.
--
-- sold_source records who decided. A dealer marking sold by hand must outlive
-- a later feed that still shows the watch; a feed-retired watch may come back
-- when the shop relists it.

-- ---------------------------------------------------------------------------
-- Provenance on sold
-- ---------------------------------------------------------------------------

alter table public.listings
  add column sold_source text
  check (
    sold_source is null
    or sold_source in ('feed_unavailable', 'missing_from_catalog', 'dealer')
  );

comment on column public.listings.sold_source is
  'Who decided the watch is sold. Null when for sale. dealer sticks across feed refreshes; feed_* may clear when the shop lists it again.';

-- Hand edits via PostgREST do not go through apply_source_item, so they never
-- set graham.sync. Stamp dealer provenance whenever a human flips sold_at.
create function public.listings_mark_sold_source()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sold_at is not distinct from old.sold_at then
    return new;
  end if;

  -- Catalogue reconciliation sets sold_source in the same UPDATE under
  -- graham.sync. Leave its choice alone.
  if current_setting('graham.sync', true) = 'on' then
    return new;
  end if;

  if new.sold_at is null then
    new.sold_source := null;
  elsif new.sold_source is null
     or new.sold_source is not distinct from old.sold_source then
    new.sold_source := 'dealer';
  end if;

  return new;
end;
$$;

create trigger listings_mark_sold_source
  before update of sold_at on public.listings
  for each row
  execute function public.listings_mark_sold_source();

-- ---------------------------------------------------------------------------
-- Freshness on the shop
-- ---------------------------------------------------------------------------

alter table public.dealers
  add column last_synced_at timestamptz,
  add column last_sync_complete boolean,
  add column last_sync_error text,
  add column last_sync_found integer,
  add column last_sync_added integer,
  add column last_sync_changed integer,
  add column last_sync_retired integer,
  add column last_sync_relisted integer;

-- ---------------------------------------------------------------------------
-- Reconcile stock against what a catalogue read actually saw
-- ---------------------------------------------------------------------------

drop function public.sync_source_availability(uuid, uuid[]);

/**
 * Stamp availability on listings linked to this read, and — only when the
 * catalogue was complete — retire watches that vanished from the feed.
 *
 * Returns {"retired": n, "relisted": n}.
 */
create function public.sync_source_availability(
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
  -- Null subject is the service role (nightly refresh). Same stance as
  -- require_operator: the key already bypasses RLS, so refusing it here only
  -- blocks the scheduled path while protecting nothing.
  if (select auth.uid()) is not null and not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  -- Catalogue writes must not look like hand edits on sold_source.
  perform set_config('graham.sync', 'on', true);

  -- Seen this read: stamp checked_at; retire when the shop says unavailable;
  -- clear a feed-sourced sold when the shop lists it again.
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

  -- Absence is only evidence when we know we saw the whole catalogue.
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

  return jsonb_build_object('retired', retired, 'relisted', relisted);
end;
$$;

revoke execute on function public.sync_source_availability(uuid, uuid[], boolean)
  from public, anon;
grant execute on function public.sync_source_availability(uuid, uuid[], boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Record the outcome of a catalogue read on the shop itself
-- ---------------------------------------------------------------------------

create function public.record_dealer_sync(
  p_dealer_id uuid,
  p_complete boolean,
  p_error text default null,
  p_found integer default null,
  p_added integer default null,
  p_changed integer default null,
  p_retired integer default null,
  p_relisted integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service role (nightly job) has no subject; authenticated callers must
  -- control the shop. Same pattern as require_operator.
  if (select auth.uid()) is not null and not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  update public.dealers d
  set
    last_synced_at = now(),
    last_sync_complete = p_complete,
    last_sync_error = nullif(trim(p_error), ''),
    last_sync_found = p_found,
    last_sync_added = p_added,
    last_sync_changed = p_changed,
    last_sync_retired = p_retired,
    last_sync_relisted = p_relisted
  where d.id = p_dealer_id;

  if not found then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.record_dealer_sync(
  uuid, boolean, text, integer, integer, integer, integer, integer
) from public, anon;
grant execute on function public.record_dealer_sync(
  uuid, boolean, text, integer, integer, integer, integer, integer
) to authenticated, service_role;

-- Prefer the shop-level stamp over max(availability_checked_at), which stayed
-- null for shops that had never swept a linked listing.
create or replace function public.dealer_reputation(p_dealer_id uuid)
returns table (
  joined_at timestamptz,
  listings_live integer,
  watches_sold integer,
  last_refreshed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.created_at,
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and l.status = 'active'
        and l.sold_at is null
    )::integer,
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and l.sold_at is not null
    )::integer,
    coalesce(
      d.last_synced_at,
      (
        select max(l.availability_checked_at)
        from public.listings l
        where l.dealer_id = d.id
      )
    )
  from public.dealers d
  where d.id = p_dealer_id;
$$;

-- ---------------------------------------------------------------------------
-- Operator console: freshness beside the catalogue counts
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
  last_sync_relisted integer
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
      d.last_sync_relisted
    from public.dealers d
    left join listing_counts lc on lc.dealer_id = d.id
    left join catalog_counts cc on cc.dealer_id = d.id
    order by d.created_at desc;
end;
$$;

revoke execute on function public.operator_dealers() from public;
grant execute on function public.operator_dealers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Service role may run the catalogue RPCs (nightly refresh of claimed shops)
-- ---------------------------------------------------------------------------

create or replace function public.adopt_existing_listings(p_dealer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  adopted integer;
begin
  if (select auth.uid()) is not null and not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  with paired as (
    select distinct on (s.id) s.id as source_item_id, l.id as listing_id
    from public.source_items s
    join public.listings l
      on l.dealer_id = s.dealer_id
     and public.url_path(l.source_url) = public.url_path(s.source_url)
    where s.dealer_id = p_dealer_id
      and s.listing_id is null
      and l.source_url is not null
      and not exists (
        select 1 from public.source_items other where other.listing_id = l.id
      )
    order by s.id, l.created_at
  ),
  linked as (
    update public.source_items s
    set listing_id = p.listing_id,
        publish = true
    from paired p
    where s.id = p.source_item_id
    returning s.id
  )
  select count(*) into adopted from linked;

  return adopted;
end;
$$;

create or replace function public.apply_source_item(p_source_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.source_items;
  fields jsonb;
  target uuid;
  actor uuid := (select auth.uid());
begin
  select * into item from public.source_items where id = p_source_item_id;
  if item.id is null then
    raise exception 'No such catalogue item.';
  end if;

  if actor is null then
    -- Nightly refresh: attribute the insert to whoever owns the shop today.
    select coalesce(d.claimed_by, d.created_by) into actor
    from public.dealers d
    where d.id = item.dealer_id;
  elsif not public.controls_dealer(item.dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if item.extracted is null then
    raise exception 'That watch has not been read yet.';
  end if;

  fields := item.extracted;
  target := item.listing_id;

  perform set_config('graham.sync', 'on', true);

  if target is null then
    insert into public.listings (
      dealer_id, imported_by, source_url, brand, model, reference, year, caliber,
      winding, case_size_mm, case_material, dial_color, style, complications,
      condition, has_box, has_papers, price_cents, currency, description
    )
    values (
      item.dealer_id,
      actor,
      item.source_url,
      fields ->> 'brand',
      fields ->> 'model',
      fields ->> 'reference',
      (fields ->> 'year')::integer,
      fields ->> 'caliber',
      (fields ->> 'winding')::public.winding,
      (fields ->> 'case_size_mm')::numeric,
      (fields ->> 'case_material')::public.case_material,
      (fields ->> 'dial_color')::public.dial_color,
      (fields ->> 'style')::public.watch_style,
      coalesce(
        (select array_agg(value::public.complication)
         from jsonb_array_elements_text(fields -> 'complications')),
        '{}'
      ),
      fields ->> 'condition',
      (fields ->> 'has_box')::boolean,
      (fields ->> 'has_papers')::boolean,
      (fields ->> 'price_cents')::bigint,
      coalesce(fields ->> 'currency', 'USD'),
      fields ->> 'description'
    )
    returning id into target;
  else
    update public.listings l set
      brand = public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand'),
      model = public.keep_edit(l.edited_fields, 'model', l.model, fields ->> 'model'),
      reference = public.keep_edit(l.edited_fields, 'reference', l.reference, fields ->> 'reference'),
      year = public.keep_edit(l.edited_fields, 'year', l.year, (fields ->> 'year')::integer),
      caliber = public.keep_edit(l.edited_fields, 'caliber', l.caliber, fields ->> 'caliber'),
      winding = public.keep_edit(l.edited_fields, 'winding', l.winding, (fields ->> 'winding')::public.winding),
      case_size_mm = public.keep_edit(l.edited_fields, 'case_size_mm', l.case_size_mm, (fields ->> 'case_size_mm')::numeric),
      case_material = public.keep_edit(l.edited_fields, 'case_material', l.case_material, (fields ->> 'case_material')::public.case_material),
      dial_color = public.keep_edit(l.edited_fields, 'dial_color', l.dial_color, (fields ->> 'dial_color')::public.dial_color),
      style = public.keep_edit(l.edited_fields, 'style', l.style, (fields ->> 'style')::public.watch_style),
      complications = public.keep_edit(
        l.edited_fields,
        'complications',
        l.complications,
        coalesce(
          (select array_agg(value::public.complication)
           from jsonb_array_elements_text(fields -> 'complications')),
          '{}'::public.complication[]
        )
      ),
      condition = public.keep_edit(l.edited_fields, 'condition', l.condition, fields ->> 'condition'),
      has_box = public.keep_edit(l.edited_fields, 'has_box', l.has_box, (fields ->> 'has_box')::boolean),
      has_papers = public.keep_edit(l.edited_fields, 'has_papers', l.has_papers, (fields ->> 'has_papers')::boolean),
      price_cents = public.keep_edit(l.edited_fields, 'price_cents', l.price_cents, (fields ->> 'price_cents')::bigint),
      currency = public.keep_edit(l.edited_fields, 'currency', l.currency, coalesce(fields ->> 'currency', l.currency)),
      description = public.keep_edit(l.edited_fields, 'description', l.description, fields ->> 'description'),
      source_url = public.keep_edit(l.edited_fields, 'source_url', l.source_url, item.source_url),
      brand_key = public.brand_key(
        public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand')
      )
    where l.id = target;
  end if;

  perform set_config('graham.sync', 'off', true);

  update public.source_items
  set listing_id = target,
      applied_hash = content_hash,
      error = null
  where id = item.id;

  return target;
end;
$$;
