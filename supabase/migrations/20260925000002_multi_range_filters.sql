-- Era, case size, and price are each a list of ranges. A watch matches a group
-- when it falls in any chosen range: the 1960s or the 1970s, not both at once.
-- Across groups the old rule stands — a Rolex and a 1960s watch.
--
-- Open ends travel as nulls inside the arrays. "Under 34mm" is (null, 34).
-- One range is a one-element array, so the predicate does not have a second
-- shape for the single-choice case.
--
-- The predicate is copied into listing_counts on purpose. See that function.

drop function if exists public.search_listings(
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
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  boolean,
  uuid[]
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
  p_year_maxs integer[] default null
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
    and l.imported_by is distinct from (select auth.uid())
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
    -- Every complication asked for must be present, not just one of them.
    and (p_complications is null or l.complications @> p_complications)
    -- A missing price cannot sit inside a band: "under $10k" is a claim we
    -- cannot make about "price on request".
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
    -- Wrapped in coalesce so this reads as an array, not a subquery: the planner
    -- lifts it to an InitPlan and evaluates the profile lookup once, not per row.
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

drop function if exists public.listing_counts(
  boolean,
  text,
  text[],
  public.watch_style[],
  public.case_material[],
  public.winding[],
  public.complication[],
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  uuid[]
);

create function public.listing_counts(
  p_exclude_swiped boolean default false,
  p_query text default null,
  p_brands text[] default null,
  p_styles public.watch_style[] default null,
  p_materials public.case_material[] default null,
  p_windings public.winding[] default null,
  p_complications public.complication[] default null,
  p_dealers uuid[] default null,
  p_price_mins integer[] default null,
  p_price_maxs integer[] default null,
  p_size_mins numeric[] default null,
  p_size_maxs numeric[] default null,
  p_year_mins integer[] default null,
  p_year_maxs integer[] default null
)
returns table (matched bigint, total bigint)
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
      and l.imported_by is distinct from (select auth.uid())
  )
  select
    (
      select count(*)
      from visible v
      where (
          not p_exclude_swiped
          or not exists (
            select 1
            from public.swipes s
            where s.listing_id = v.id
              and s.actor_id = (select auth.uid())
          )
        )
        and (p_brands is null or v.brand_key = any (p_brands))
        and (p_dealers is null or v.dealer_id = any (p_dealers))
        and (p_styles is null or v.style = any (p_styles))
        and (p_materials is null or v.case_material = any (p_materials))
        and (p_windings is null or v.winding = any (p_windings))
        and (p_complications is null or v.complications @> p_complications)
        and (
          p_price_mins is null
          or exists (
            select 1
            from unnest(p_price_mins, p_price_maxs) as band(lo, hi)
            where v.price_cents is not null
              and (lo is null or v.price_cents >= lo)
              and (hi is null or v.price_cents <= hi)
          )
        )
        and (
          p_size_mins is null
          or exists (
            select 1
            from unnest(p_size_mins, p_size_maxs) as band(lo, hi)
            where v.case_size_mm is not null
              and (lo is null or v.case_size_mm >= lo)
              and (hi is null or v.case_size_mm <= hi)
          )
        )
        and (
          p_year_mins is null
          or exists (
            select 1
            from unnest(p_year_mins, p_year_maxs) as band(lo, hi)
            where v.year is not null
              and (lo is null or v.year >= lo)
              and (hi is null or v.year <= hi)
          )
        )
        and (
          p_query is null
          or p_query = ''
          or to_tsvector('english', coalesce(v.brand, '') || ' ' || coalesce(v.model, '') || ' ' || coalesce(v.reference, ''))
             @@ websearch_to_tsquery('english', p_query)
          or v.brand ilike '%' || p_query || '%'
          or v.model ilike '%' || p_query || '%'
          or v.reference ilike '%' || p_query || '%'
        )
    ) as matched,
    (select count(*) from visible) as total;
$$;
