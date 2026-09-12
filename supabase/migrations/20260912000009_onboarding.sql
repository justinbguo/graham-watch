-- Onboarding asks for a name and the brands you already care about.
--
-- `onboarded_at` is what the app gates on, not an empty brand list: picking no
-- brands is a real answer and must not be mistaken for never having been asked.
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column favorite_brands text[] not null default '{}',
  add column onboarded_at timestamptz;

-- display_name held the same two names in one string and nothing ever read it.
alter table public.profiles drop column display_name;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := coalesce(meta ->> 'full_name', meta ->> 'name', '');
  given text := nullif(meta ->> 'given_name', '');
  family text := nullif(meta ->> 'family_name', '');
begin
  -- Apple and Google hand over a name on the first sign-in and never again, so
  -- take it here. Onboarding shows it back as a prefill the user can correct.
  if given is null and full_name <> '' then
    given := split_part(full_name, ' ', 1);
  end if;

  if family is null and position(' ' in full_name) > 0 then
    family := substr(full_name, position(' ' in full_name) + 1);
  end if;

  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (new.id, given, family, meta ->> 'avatar_url')
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Favourite brands rank the deck, they do not filter it. Filtering on a first-run
-- answer would hide the rest of the catalogue behind a choice made before the
-- user had seen any of it.
drop function if exists public.get_deck(integer);
drop function if exists public.search_listings(
  integer, integer, boolean, text, text, text[],
  public.watch_style[], public.case_material[], public.winding[], public.complication[],
  integer, integer, numeric, numeric, integer, integer
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
  p_price_min integer default null,
  p_price_max integer default null,
  p_size_min numeric default null,
  p_size_max numeric default null,
  p_year_min integer default null,
  p_year_max integer default null,
  p_favorites_first boolean default false
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
