-- The deck header says how much of the catalogue a buyer is looking at: how
-- many watches match the filters, and how many the marketplace holds.
--
-- The deck itself can answer neither. It is fetched one pile deep, so counting
-- the rows it returned tops out at the pile: at twenty the app genuinely does
-- not know whether there are twenty-one or two hundred, and the header said
-- "20+" rather than guess.
--
-- The predicate is search_listings' own, minus its ordering and its limit.
-- That is a copy on purpose. A shared helper carrying `set search_path = ''`
-- cannot be inlined by the planner, so routing the deck through one would make
-- its sort materialise every matching row before taking twenty — a third copy
-- that stays fast beats one copy that slows the screen every buyer opens on.
-- listing_facets already holds the second.
--
-- `total` ignores the filters and the swipe history: it is the size of the
-- catalogue, which is what "on the marketplace" means. Both counts drop the
-- caller's own imports, because a shop's own window is not a listing offered
-- to them.

create function public.listing_counts(
  p_exclude_swiped boolean default false,
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
  p_year_max integer default null,
  p_dealers uuid[] default null
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
        and (p_price_min is null or v.price_cents >= p_price_min)
        and (p_price_max is null or v.price_cents <= p_price_max)
        and (p_size_min is null or v.case_size_mm >= p_size_min)
        and (p_size_max is null or v.case_size_mm <= p_size_max)
        and (p_year_min is null or v.year >= p_year_min)
        and (p_year_max is null or v.year <= p_year_max)
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
