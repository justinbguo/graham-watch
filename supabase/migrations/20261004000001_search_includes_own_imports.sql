-- Search and the deck share this function. The deck hides watches the caller
-- imported: swiping a shop you just published is not shopping. Search is where
-- you go to check that shop is findable, so it asks with p_exclude_own false.
--
-- The default stays true. get_deck and every existing caller keep the old
-- rule without knowing about the new argument.

drop function public.get_deck(integer);

drop function public.search_listings(
  integer,
  integer,
  boolean,
  text,
  text,
  text[],
  public.watch_style[],
  public.case_material[],
  public.winding[],
  public.complication[],
  boolean,
  uuid[],
  integer[],
  integer[],
  numeric[],
  numeric[],
  integer[],
  integer[]
);

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
  p_favorites_first boolean default false,
  p_dealers uuid[] default null,
  p_price_mins integer[] default null,
  p_price_maxs integer[] default null,
  p_size_mins numeric[] default null,
  p_size_maxs numeric[] default null,
  p_year_mins integer[] default null,
  p_year_maxs integer[] default null,
  p_exclude_own boolean default true
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
    and l.sold_at is null
    and d.permission = 'approved'
    and (
      not p_exclude_own
      or l.imported_by is distinct from (select auth.uid())
    )
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
    and (p_dealers is null or l.dealer_id = any (p_dealers))
    and (p_styles is null or l.style = any (p_styles))
    and (p_materials is null or l.case_material = any (p_materials))
    and (p_windings is null or l.winding = any (p_windings))
    and (p_complications is null or l.complications @> p_complications)
    and (
      p_price_mins is null
      or exists (
        select 1
        from unnest(p_price_mins, p_price_maxs) as band(lo, hi)
        where l.price_cents is not null
          and (lo is null or l.price_cents >= lo)
          and (hi is null or l.price_cents <= hi)
      )
    )
    and (
      p_size_mins is null
      or exists (
        select 1
        from unnest(p_size_mins, p_size_maxs) as band(lo, hi)
        where l.case_size_mm is not null
          and (lo is null or l.case_size_mm >= lo)
          and (hi is null or l.case_size_mm <= hi)
      )
    )
    and (
      p_year_mins is null
      or exists (
        select 1
        from unnest(p_year_mins, p_year_maxs) as band(lo, hi)
        where l.year is not null
          and (lo is null or l.year >= lo)
          and (hi is null or l.year <= hi)
      )
    )
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
    case
      when p_favorites_first
        and l.brand_key = any (
          coalesce(
            (select p.favorite_brands from public.profiles p where p.id = (select auth.uid())),
            '{}'::text[]
          )
        )
      then 0
      else 1
    end,
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
  select *
  from public.search_listings(
    p_limit => p_limit,
    p_exclude_swiped => true,
    p_favorites_first => true
  );
$$;

-- The search filter list has to offer a shop the search results contain.
-- The deck's list keeps the old cut, so it never offers a dealer whose
-- watches the deck will then hide.
drop function public.listing_facets();

create function public.listing_facets(p_exclude_own boolean default true)
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
      and l.sold_at is null
      and d.permission = 'approved'
      and (
        not p_exclude_own
        or l.imported_by is distinct from (select auth.uid())
      )
  )
  select 'brand', brand_key, min(brand), count(*)
  from visible where brand_key is not null group by brand_key
  union all
  select 'dealer', v.dealer_id::text, min(d.name), count(*)
  from visible v join public.dealers d on d.id = v.dealer_id group by v.dealer_id
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
