-- Account deletion has to leave the catalogue. A shop is a row we imported,
-- not a login: buyers still need those watches after the person who claimed
-- or fetched them is gone. created_by and imported_by used to cascade, so
-- deleting an importer wiped every listing they had ever published.
--
-- SET NULL is the matching rule for claimed_by. The deck hid "your own import"
-- with `imported_by <> auth.uid()`, which drops a null (unknown is not true),
-- so that comparison becomes IS DISTINCT FROM in the same change.

alter table public.dealers
  alter column created_by drop not null;

alter table public.dealers
  drop constraint dealers_created_by_fkey,
  add constraint dealers_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.listings
  alter column imported_by drop not null;

alter table public.listings
  drop constraint listings_imported_by_fkey,
  add constraint listings_imported_by_fkey
    foreign key (imported_by) references public.profiles (id) on delete set null;

create or replace function public.search_listings(
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
  p_favorites_first boolean default false,
  p_dealers uuid[] default null
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

create or replace function public.listing_facets()
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
      and l.imported_by is distinct from (select auth.uid())
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

-- Auth users cannot be deleted with the anon key the app ships. This runs as
-- the function owner, but only for auth.uid(), so the caller can erase
-- themselves and nobody else. Swipes, inquiries, and the profile cascade from
-- that row; shops and listings stay, with their person-pointers cleared.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from storage.objects
  where bucket_id = 'avatars'
    and split_part(name, '/', 1) = actor::text;

  delete from auth.users where id = actor;

  if not found then
    raise exception 'Your account is no longer on this server.';
  end if;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
