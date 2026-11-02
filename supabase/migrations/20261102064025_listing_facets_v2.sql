-- Facet counts for the filter sheet, from the same match as the deck.
--
-- listing_facets takes no filter, so the sheet offered every brand in the
-- catalogue and ignored the price, the era, and the watches already swiped.
-- listing_facets_v2(spec, exclude_swiped, exclude_own) counts from the
-- watches listing_matches keeps. The spec is the FilterSpec canonicalize()
-- stores. A missing field is no cut on that dimension.
--
-- Each dimension is counted with that dimension's own selection removed and
-- every other cut left in place. Choosing Rolex does not shrink the Rolex
-- count; it shrinks the counts beside style, price, and the rest. That is
-- the usual faceted-search rule, and it is why a selected row stays visible
-- while you look at the others.
--
-- A watch with no value for the dimension lands in one bucket whose value
-- is the empty string and whose label is Unknown. Brand, dealer, style,
-- material, and winding hold one value each, so those buckets, Unknown
-- included, add up to the matched count of the spec with that dimension
-- removed. Complications are the exception: a watch with chronograph and
-- date is in both rows, and Unknown is only the watches with none.
--
-- Price, size, and era are not buckets here. The panel already lists every
-- preset, and size and price presets share their endpoints, so those rows
-- cannot add up to matched. They stay in the spec and narrow every bucket
-- this function does return.
--
-- Visibility is the listing_counts_v2 rule: active, not sold, shop approved,
-- then the same own-shop and already-swiped checks. v1 listing_facets is
-- left in place. Onboarding still calls it.

create function public.listing_facets_v2(
  p_spec jsonb default '{}'::jsonb,
  p_exclude_swiped boolean default false,
  p_exclude_own boolean default true
)
returns table (kind text, value text, label text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with args as (
    select
      coalesce(p_spec, '{}'::jsonb) as spec,
      coalesce(p_exclude_swiped, false) as exclude_swiped,
      coalesce(p_exclude_own, true) as exclude_own
  ),
  visible as (
    select l as listing, d.name as dealer_name
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    cross join args
    where l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
      and public.discovery_visible_to_caller(args.exclude_own, l.imported_by, d.claimed_by)
      and (
        not args.exclude_swiped
        or not exists (
          select 1
          from public.swipes s
          where s.listing_id = l.id
            and s.actor_id = (select auth.uid())
        )
      )
  ),
  -- Six calls, one scan. Dropping the key is what makes the count ignore
  -- the selection on that dimension and keep every other cut, including a
  -- text query, a price band, and a size or era preset.
  scoped as (
    select
      v.listing,
      v.dealer_name,
      public.listing_matches(v.listing, args.spec - 'brands') as brand_ok,
      public.listing_matches(v.listing, args.spec - 'dealers') as dealer_ok,
      public.listing_matches(v.listing, args.spec - 'styles') as style_ok,
      public.listing_matches(v.listing, args.spec - 'materials') as material_ok,
      public.listing_matches(v.listing, args.spec - 'windings') as winding_ok,
      public.listing_matches(v.listing, args.spec - 'complications') as complication_ok
    from visible v
    cross join args
  ),
  facet as (
    select
      'brand'::text as kind,
      g.value,
      case when g.value = '' then 'Unknown' else min(g.brand) end as label,
      count(*) as n
    from (
      select
        -- brand_key() stores null, not '', when the brand has no letters.
        -- '' is the Unknown bucket and cannot collide with a real key.
        case
          when btrim(coalesce((s.listing).brand_key, '')) = '' then ''
          else (s.listing).brand_key
        end as value,
        (s.listing).brand as brand
      from scoped s
      where s.brand_ok
    ) g
    group by g.value

    union all

    select
      'dealer'::text,
      g.value,
      min(g.dealer_name),
      count(*)
    from (
      select (s.listing).dealer_id::text as value, s.dealer_name
      from scoped s
      where s.dealer_ok
        and (s.listing).dealer_id is not null
    ) g
    group by g.value

    union all

    select 'dealer'::text, ''::text, 'Unknown'::text, count(*)
    from scoped s
    where s.dealer_ok
      and (s.listing).dealer_id is null
    having count(*) > 0

    union all

    select
      'style'::text,
      g.value,
      case when g.value = '' then 'Unknown' else g.value end,
      count(*)
    from (
      select
        case
          when (s.listing).style is null then ''
          else (s.listing).style::text
        end as value
      from scoped s
      where s.style_ok
    ) g
    group by g.value

    union all

    select
      'case_material'::text,
      g.value,
      case when g.value = '' then 'Unknown' else g.value end,
      count(*)
    from (
      select
        case
          when (s.listing).case_material is null then ''
          else (s.listing).case_material::text
        end as value
      from scoped s
      where s.material_ok
    ) g
    group by g.value

    union all

    select
      'winding'::text,
      g.value,
      case when g.value = '' then 'Unknown' else g.value end,
      count(*)
    from (
      select
        case
          when (s.listing).winding is null then ''
          else (s.listing).winding::text
        end as value
      from scoped s
      where s.winding_ok
    ) g
    group by g.value

    union all

    select 'complication'::text, ''::text, 'Unknown'::text, count(*)
    from scoped s
    where s.complication_ok
      and cardinality(
        coalesce((s.listing).complications, '{}'::public.complication[])
      ) = 0
    having count(*) > 0

    union all

    select
      'complication'::text,
      c.value::text,
      c.value::text,
      count(distinct (s.listing).id)
    from scoped s
    cross join lateral unnest((s.listing).complications) as c(value)
    where s.complication_ok
    group by c.value
  )
  select facet.kind, facet.value, facet.label, facet.n
  from facet
  order by facet.kind, facet.n desc, facet.value;
$$;

revoke all on function public.listing_facets_v2(jsonb, boolean, boolean) from public;
grant execute on function public.listing_facets_v2(jsonb, boolean, boolean) to anon, authenticated, service_role;
