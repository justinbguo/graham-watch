-- What the operator console needs to seed the deck from a pasted list of shops.
--
-- Three numbers per shop, not one. Adding forty shops reads their catalogues
-- into source_items and creates no listings at all, so a console showing only
-- listing counts would report forty empty shops and give no way to tell a
-- sitemap we could not read from a shop we simply have not imported yet.
--
-- Everything here is a function rather than a table read for the reason
-- 20260915000005 gives: dealers.contact_email is not granted to authenticated,
-- and a pending shop's listings and source_items are readable only by whoever
-- imported them. An operator reading either through PostgREST sees nothing.

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
  can_import boolean
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
        -- The shop-level half of the deck's own predicate, including the
        -- permission the deck requires. See 20260917000003.
        count(*) filter (where l.status = 'active' and l.sold_at is null) as sellable
      from public.listings l
      group by l.dealer_id
    ),
    catalog_counts as (
      select
        s.dealer_id,
        count(*) filter (where s.available) as total,
        -- Marked for import and not yet a listing: what a run that stopped
        -- half way leaves behind. Importing again drains exactly these.
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
      -- Whether running the importer on this shop would work, asked here so a
      -- button can be disabled instead of failing. The same function the
      -- source_items policies and apply_source_item use, so the answer cannot
      -- disagree with what the write would actually do.
      --
      -- False for a shop a dealer has claimed: they manage their own inventory.
      public.controls_dealer(d.id)
    from public.dealers d
    left join listing_counts lc on lc.dealer_id = d.id
    left join catalog_counts cc on cc.dealer_id = d.id
    order by d.created_at desc;
end;
$$;

revoke execute on function public.operator_dealers() from public;
grant execute on function public.operator_dealers() to authenticated, service_role;

/**
 * One shop's watches, as imported.
 *
 * thumb_path is a path and not a URL, because the bucket is public and the
 * client already knows the project it is talking to. Returning a URL would
 * bake this project's hostname into a row.
 */
create function public.operator_listings(p_dealer_id uuid)
returns table (
  id uuid,
  source_url text,
  brand text,
  model text,
  reference text,
  year integer,
  case_size_mm numeric,
  condition text,
  price_cents bigint,
  currency text,
  status public.listing_status,
  sold_at timestamptz,
  created_at timestamptz,
  photo_count bigint,
  thumb_path text
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
      l.source_url,
      l.brand,
      l.model,
      l.reference,
      l.year,
      l.case_size_mm,
      l.condition,
      l.price_cents,
      l.currency,
      l.status,
      l.sold_at,
      l.created_at,
      (select count(*) from public.listing_photos p where p.listing_id = l.id),
      (
        select p.storage_path
        from public.listing_photos p
        where p.listing_id = l.id
        order by p.position
        limit 1
      )
    from public.listings l
    where l.dealer_id = p_dealer_id
    order by l.created_at desc;
end;
$$;

revoke execute on function public.operator_listings(uuid) from public;
grant execute on function public.operator_listings(uuid) to authenticated, service_role;

/**
 * The catalogue rows that did not become watches.
 *
 * Seeding forty shops at once means some of them read badly, and a count of
 * failures with no way to see the reason is a dead end. This is that reason:
 * the shop's own title for the item, the URL, and what went wrong.
 */
create function public.operator_catalog_problems(p_dealer_id uuid)
returns table (
  id uuid,
  source_url text,
  title text,
  error text,
  queued boolean,
  last_seen_at timestamptz
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
      s.id,
      s.source_url,
      -- The adapter stores the shop's own prose under raw; title is the only
      -- part of it worth showing next to an error.
      nullif(s.raw ->> 'title', ''),
      s.error,
      s.publish,
      s.last_seen_at
    from public.source_items s
    where s.dealer_id = p_dealer_id
      and s.listing_id is null
      and (s.error is not null or s.publish)
    order by s.error nulls last, s.last_seen_at desc;
end;
$$;

revoke execute on function public.operator_catalog_problems(uuid) from public;
grant execute on function public.operator_catalog_problems(uuid) to authenticated, service_role;
