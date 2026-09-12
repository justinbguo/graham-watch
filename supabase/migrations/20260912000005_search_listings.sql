-- The deck and the search tab ask the same question with one difference: the
-- deck hides what you already swiped. Two functions would mean two places to
-- forget a rule, so there is one, and get_deck becomes a thin call to it.
drop function if exists public.get_deck(integer);

create function public.search_listings(
  p_limit integer default 20,
  p_offset integer default 0,
  p_exclude_swiped boolean default false,
  p_sort text default 'newest',
  p_query text default null,
  p_brands text[] default null,
  p_styles public.watch_style[] default null,
  p_materials public.case_material[] default null,
  p_windings public.winding[] default null,
  p_complications public.complication[] default null,
  p_price_min integer default null,
  p_price_max integer default null,
  p_size_min numeric default null,
  p_size_max numeric default null,
  p_year_min integer default null,
  p_year_max integer default null
)
returns setof public.listings
language sql
stable
security invoker
set search_path = ''
as $$
  select l.*
  from public.listings l
  join public.dealers d on d.id = l.dealer_id
  where l.status = 'active'
    and d.permission = 'approved'
    and l.imported_by <> (select auth.uid())
    and (
      not p_exclude_swiped
      or not exists (
        select 1
        from public.swipes s
        where s.listing_id = l.id
          and s.actor_id = (select auth.uid())
      )
    )
    and (p_brands is null or l.brand_key = any (p_brands))
    and (p_styles is null or l.style = any (p_styles))
    and (p_materials is null or l.case_material = any (p_materials))
    and (p_windings is null or l.winding = any (p_windings))
    -- Every complication asked for must be present, not just one of them.
    and (p_complications is null or l.complications @> p_complications)
    -- A watch with no published price is excluded the moment a price range is
    -- set: "under $10k" is a claim we cannot make about "price on request".
    and (p_price_min is null or l.price_cents >= p_price_min)
    and (p_price_max is null or l.price_cents <= p_price_max)
    and (p_size_min is null or l.case_size_mm >= p_size_min)
    and (p_size_max is null or l.case_size_mm <= p_size_max)
    and (p_year_min is null or l.year >= p_year_min)
    and (p_year_max is null or l.year <= p_year_max)
    and (
      p_query is null
      or p_query = ''
      or to_tsvector('english', coalesce(l.brand, '') || ' ' || coalesce(l.model, '') || ' ' || coalesce(l.reference, ''))
         @@ websearch_to_tsquery('english', p_query)
      or l.brand ilike '%' || p_query || '%'
      or l.model ilike '%' || p_query || '%'
      or l.reference ilike '%' || p_query || '%'
    )
  order by
    case when p_sort = 'price_asc' then l.price_cents end asc nulls last,
    case when p_sort = 'price_desc' then l.price_cents end desc nulls last,
    case when p_sort = 'oldest' then l.year end asc nulls last,
    case when p_sort = 'newest_watch' then l.year end desc nulls last,
    l.created_at desc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

create function public.get_deck(p_limit integer default 20)
returns setof public.listings
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.search_listings(p_limit => p_limit, p_exclude_swiped => true);
$$;

-- Powers the filter UI: only offer a brand somebody can actually pick.
create function public.listing_facets()
returns table (kind text, value text, label text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select l.*
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    where l.status = 'active'
      and d.permission = 'approved'
      and l.imported_by <> (select auth.uid())
  )
  select 'brand', brand_key, min(brand), count(*)
  from visible where brand_key is not null group by brand_key
  union all
  select 'style', style::text, style::text, count(*)
  from visible where style is not null group by style
  union all
  select 'case_material', case_material::text, case_material::text, count(*)
  from visible where case_material is not null group by case_material
  union all
  select 'winding', winding::text, winding::text, count(*)
  from visible where winding is not null group by winding
  union all
  select 'complication', c::text, c::text, count(*)
  from visible, unnest(complications) as c group by c
  order by 1, 4 desc;
$$;
