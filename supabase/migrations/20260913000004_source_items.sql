-- The dealer's own catalogue as we last read it: one row per product, upserted
-- on every refresh.
--
-- Before this there was no such record, so a refresh was a fresh import that
-- could only insert. A price cut on the shop's own site never reached the deck,
-- every run paid OpenAI again for watches we already had, and the whole job had
-- to finish inside one edge function invocation — which is what capped an
-- import at 40 watches.
--
-- With the catalogue stored, a refresh is a diff and extraction is a queue that
-- survives between calls, so the cap is on the batch rather than on the shop.
create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  provider text not null,

  -- The platform's own product id where it publishes one. Keying on the URL
  -- path instead means a dealer editing a product slug reads as a new watch and
  -- the old one never retires.
  external_id text not null,
  source_url text not null,
  raw jsonb not null,

  -- Title and prose only. Rewording these is the one change that needs the
  -- model again, and the model is the only part of a refresh that costs money.
  text_hash text not null,
  -- text_hash plus price, currency, stock and photo URLs. Changing these needs
  -- the listing rewritten from facts the shop stated, at no cost.
  content_hash text not null,

  available boolean not null default true,

  -- Nothing is typed or published until the shop ticks it, so a refresh can read
  -- a 300-watch catalogue without queueing a bill for 300 extractions.
  publish boolean not null default false,

  extracted jsonb,
  -- text_hash as it stood when `extracted` was written; null until typed once.
  extracted_hash text,
  -- content_hash as it stood when the listing was last written.
  applied_hash text,
  -- The gallery we last copied into storage. Copying photos is the slowest part
  -- of publishing, so it only reruns when the shop's gallery actually changes.
  photos_hash text,
  error text,

  listing_id uuid references public.listings (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  unique (dealer_id, external_id)
);

create index source_items_dealer_idx on public.source_items (dealer_id, last_seen_at desc);
create unique index source_items_listing_idx
  on public.source_items (listing_id)
  where listing_id is not null;

-- What the extraction worker drains. Partial, so the index stays the size of
-- the backlog rather than the size of every catalogue we have ever read.
create index source_items_pending_idx
  on public.source_items (dealer_id)
  where publish
    and (extracted_hash is distinct from text_hash or applied_hash is distinct from content_hash);

alter table public.source_items enable row level security;

-- A catalogue read is the shop's own commercial data, including watches it has
-- not published. Only the shop sees it; buyers see listings.
create policy "dealer owners read their source items"
on public.source_items for select to authenticated
using (
  exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  )
);

create policy "dealer owners write their source items"
on public.source_items for insert to authenticated
with check (
  exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  )
);

create policy "dealer owners update their source items"
on public.source_items for update to authenticated
using (
  exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  )
);

-- ---------------------------------------------------------------------------
-- Hand corrections survive a refresh
-- ---------------------------------------------------------------------------

-- Which columns a human corrected. A refresh rewrites every synced column from
-- the feed and skips these, so a dealer who fixes a reference number does not
-- have to fix it again after every refresh.
alter table public.listings add column edited_fields text[] not null default '{}';

-- The columns a refresh is allowed to write. Naming them once keeps the trigger
-- below and public.apply_source_item from drifting apart; a column in one and
-- not the other is either an edit nobody records or a field that never updates.
create function public.synced_listing_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'brand', 'model', 'reference', 'year', 'caliber', 'winding', 'case_size_mm',
    'case_material', 'dial_color', 'style', 'complications', 'condition',
    'has_box', 'has_papers', 'price_cents', 'currency', 'description', 'source_url'
  ];
$$;

-- Recording edits in the app would work until the next write path forgot, and
-- the symptom — a dealer's correction quietly reappearing as the feed's value
-- one refresh later — is invisible until someone complains. So the database
-- records it, the same way listings_brand_key already does.
--
-- public.apply_source_item sets `graham.sync` for the length of its own
-- transaction so its writes are not mistaken for a dealer's corrections. The
-- third argument to set_config is what makes it transaction-local: a
-- session-wide setting would leak onto the next request sharing that pooled
-- connection and silently disarm this trigger.
create function public.mark_listing_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  before jsonb := to_jsonb(old);
  after jsonb := to_jsonb(new);
  edited text[] := coalesce(old.edited_fields, '{}');
  col text;
begin
  if coalesce(current_setting('graham.sync', true), '') = 'on' then
    return new;
  end if;

  foreach col in array public.synced_listing_columns() loop
    if before -> col is distinct from after -> col and not (col = any (edited)) then
      edited := edited || col;
    end if;
  end loop;

  new.edited_fields := edited;
  return new;
end;
$$;

create trigger listings_mark_edits
before update on public.listings
for each row
execute function public.mark_listing_edits();

-- Returns the feed's value unless the shop corrected that column by hand.
create function public.keep_edit(
  p_edited text[],
  p_column text,
  p_current anyelement,
  p_incoming anyelement
)
returns anyelement
language sql
immutable
set search_path = ''
as $$
  select case when p_column = any (p_edited) then p_current else p_incoming end;
$$;

/**
 * Writes one read-and-typed catalogue item into the deck, inserting the listing
 * the first time and merging into it afterwards.
 *
 * security definer because it has to write columns the caller's own UPDATE
 * would be marked as editing. Ownership is re-checked here rather than left to
 * RLS, since definer bypasses it.
 */
create function public.apply_source_item(p_source_item_id uuid)
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
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into item from public.source_items where id = p_source_item_id;
  if item.id is null then
    raise exception 'No such catalogue item.';
  end if;

  if not exists (
    select 1
    from public.dealers d
    where d.id = item.dealer_id
      and (d.claimed_by = actor or d.created_by = actor)
  ) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
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
      -- brand_key mirrors brand and is never edited directly, so it follows
      -- whichever brand won above rather than the feed's.
      brand_key = public.brand_key(
        public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand')
      )
    where l.id = target;
  end if;

  -- Narrow the window back to this function. Transaction-local already keeps it
  -- off the next request, but leaving it on would disarm the trigger for any
  -- later statement in the same transaction — including a dealer's own edit.
  perform set_config('graham.sync', 'off', true);

  update public.source_items
  set listing_id = target,
      applied_hash = content_hash,
      error = null
  where id = item.id;

  return target;
end;
$$;

revoke execute on function public.apply_source_item(uuid) from public;
grant execute on function public.apply_source_item(uuid) to authenticated;

/**
 * Marks the listings behind a shop's catalogue sold or back in stock, from the
 * shop's own stock field.
 *
 * Absence from a feed is not evidence of a sale — a partial read simply did not
 * get that far — so only items the read actually saw are judged, which is what
 * `p_seen_ids` carries.
 */
create function public.sync_source_availability(p_dealer_id uuid, p_seen_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  retired integer;
begin
  if not exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and (d.claimed_by = actor or d.created_by = actor)
  ) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  -- Neither column a read writes is a synced column, so the edit trigger has
  -- nothing to say about this and `graham.sync` is not needed.
  --
  -- One UPDATE, not two: as separate data-modifying CTEs they target the same
  -- rows in one statement, and the second silently does nothing to a row the
  -- first already touched. That left every swept listing unstamped.
  with judged as (
    select s.listing_id, s.available, l.sold_at as was_sold
    from public.source_items s
    join public.listings l on l.id = s.listing_id
    where s.dealer_id = p_dealer_id
      and s.id = any (p_seen_ids)
  ),
  swept as (
    update public.listings l
    set availability_checked_at = now(),
        -- Only ever set from the feed, never cleared. A shop relisting a watch
        -- is a decision by the dealer, not something a read may infer.
        sold_at = case when not j.available and j.was_sold is null then now() else l.sold_at end
    from judged j
    where l.id = j.listing_id
    returning (not j.available and j.was_sold is null) as retired_now
  )
  select count(*) filter (where retired_now) into retired from swept;

  return retired;
end;
$$;

revoke execute on function public.sync_source_availability(uuid, uuid[]) from public;
grant execute on function public.sync_source_availability(uuid, uuid[]) to authenticated;

-- Identifies one product across the several URLs that reach it. Mirrors
-- productKey() in supabase/functions/import-listings/source.ts: an import
-- started from `https://www.shop.com` stored `www` links, while a refresh reads
-- the dealer's saved website, which has `www` stripped.
create function public.url_path(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_url is null then null
    else rtrim(lower(coalesce(substring(p_url from '^[a-z]+://[^/]+(/.*)$'), '/')), '/')
  end;
$$;

/**
 * Links catalogue items to the listings an earlier import already created, so
 * shops imported before this table existed start refreshing instead of
 * duplicating everything they sell.
 */
create function public.adopt_existing_listings(p_dealer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  adopted integer;
begin
  if not exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and (d.claimed_by = actor or d.created_by = actor)
  ) then
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
        -- An adopted watch is already in the deck, so it is published by
        -- definition. Leaving it unticked would offer the dealer a watch they
        -- already sell as if it were new.
        publish = true
    from paired p
    where s.id = p.source_item_id
    returning s.id
  )
  select count(*) into adopted from linked;

  return adopted;
end;
$$;

revoke execute on function public.adopt_existing_listings(uuid) from public;
grant execute on function public.adopt_existing_listings(uuid) to authenticated;

/**
 * The extraction backlog for one shop, oldest first.
 *
 * An RPC rather than a filter from the client because the queue is defined by
 * two columns disagreeing with each other, and PostgREST can only compare a
 * column to a literal.
 */
create function public.pending_source_items(p_dealer_id uuid, p_limit integer default 10)
returns setof public.source_items
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish
    and (
      s.extracted_hash is distinct from s.text_hash
      or s.applied_hash is distinct from s.content_hash
    )
    -- A watch the model could not read is not retried on every batch: it would
    -- sit at the head of the queue and stall everything behind it.
    and s.error is null
  order by s.first_seen_at
  limit least(greatest(p_limit, 1), 25);
$$;

-- How much of the backlog is left, so a refresh can show progress and stop.
create function public.pending_source_item_count(p_dealer_id uuid)
returns table (pending integer, failed integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (
      where s.error is null
        and (
          s.extracted_hash is distinct from s.text_hash
          or s.applied_hash is distinct from s.content_hash
        )
    )::integer,
    count(*) filter (where s.error is not null)::integer
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish;
$$;
