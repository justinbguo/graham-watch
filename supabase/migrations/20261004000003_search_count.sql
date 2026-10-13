-- Search's label was the length of the page it rendered. The page stops at
-- 50, so once the catalogue passed that the number froze and a newly
-- published watch never moved it.
--
-- listing_counts already answers "how many match" for the deck, and it drops
-- the caller's own imports. Search keeps those, so it asks with
-- p_exclude_own false. The default stays true: the deck's call is unchanged.

drop function public.listing_counts(
  boolean,
  text,
  text[],
  public.watch_style[],
  public.case_material[],
  public.winding[],
  public.complication[],
  uuid[],
  integer[],
  integer[],
  numeric[],
  numeric[],
  integer[],
  integer[]
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
  p_year_maxs integer[] default null,
  p_exclude_own boolean default true
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
      and (
        not p_exclude_own
        or l.imported_by is distinct from (select auth.uid())
      )
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
