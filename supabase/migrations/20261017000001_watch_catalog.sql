-- Reference catalog from dials.co (synced offline; the app never calls dials directly).
-- https://dials.co/developers

create extension if not exists pg_trgm with schema extensions;

-- Hosted projects may already have this catalog from an earlier manual apply.
create table if not exists public.watch_models (
  id uuid primary key default gen_random_uuid(),
  dials_id text not null,
  brand_name text not null,
  brand_slug text not null,
  series_name text not null,
  series_slug text not null,
  name text not null,
  reference_number text,
  model_slug text not null,
  thumbnail_url text,
  synced_at timestamptz not null default now(),
  constraint watch_models_dials_id_key unique (dials_id),
  constraint watch_models_brand_model_slug_key unique (brand_slug, model_slug)
);

create index if not exists watch_models_brand_slug_idx on public.watch_models (brand_slug);
create index if not exists watch_models_brand_name_trgm_idx on public.watch_models
  using gin (brand_name extensions.gin_trgm_ops);
create index if not exists watch_models_series_name_trgm_idx on public.watch_models
  using gin (series_name extensions.gin_trgm_ops);
create index if not exists watch_models_name_trgm_idx on public.watch_models
  using gin (name extensions.gin_trgm_ops);
create index if not exists watch_models_reference_trgm_idx on public.watch_models
  using gin (reference_number extensions.gin_trgm_ops);

create table if not exists public.watch_catalog_sync (
  id smallint primary key default 1 check (id = 1),
  source text not null default 'dials.co',
  models_synced integer not null default 0,
  last_page integer,
  total_pages integer,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.watch_catalog_sync (id) values (1)
on conflict (id) do nothing;

alter table public.watch_models enable row level security;
alter table public.watch_catalog_sync enable row level security;

drop policy if exists "signed-in users read watch catalog" on public.watch_models;
create policy "signed-in users read watch catalog"
  on public.watch_models
  for select
  to authenticated
  using (true);

-- Sync metadata is operator-only; the app reads counts through suggest_watches.
drop policy if exists "no direct client access to sync metadata" on public.watch_catalog_sync;
create policy "no direct client access to sync metadata"
  on public.watch_catalog_sync
  for select
  to authenticated
  using (false);

/**
 * Typeahead for brand, model, family, or reference while listing a watch.
 * Populated by scripts/sync-watch-catalog.mjs from dials.co.
 */
create or replace function public.suggest_watches(
  p_query text,
  p_brand text default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  brand_name text,
  brand_slug text,
  series_name text,
  name text,
  reference_number text,
  thumbnail_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cleaned text;
  brand_hint text;
  lim integer;
begin
  if (select auth.uid()) is null then
    raise exception 'sign in to search the watch catalog';
  end if;

  cleaned := btrim(coalesce(p_query, ''));
  if length(cleaned) < 2 then
    return;
  end if;

  lim := least(greatest(coalesce(p_limit, 12), 1), 24);
  brand_hint := btrim(coalesce(p_brand, ''));
  if brand_hint = '' then
    brand_hint := null;
  end if;

  return query
  select
    w.id,
    w.brand_name,
    w.brand_slug,
    w.series_name,
    w.name,
    w.reference_number,
    w.thumbnail_url
  from public.watch_models w
  where
    (
      w.reference_number ilike cleaned || '%'
      or w.reference_number ilike '%' || cleaned || '%'
      or w.brand_name ilike '%' || cleaned || '%'
      or w.series_name ilike '%' || cleaned || '%'
      or w.name ilike '%' || cleaned || '%'
      or (w.brand_name || ' ' || w.series_name || ' ' || w.name) ilike '%' || cleaned || '%'
    )
    and (
      brand_hint is null
      or w.brand_name ilike '%' || brand_hint || '%'
      or w.brand_slug ilike '%' || lower(replace(brand_hint, ' ', '-')) || '%'
    )
  order by
    case when w.reference_number ilike cleaned || '%' then 0 else 1 end,
    case when w.reference_number = cleaned then 0 else 1 end,
    extensions.similarity(
      coalesce(w.reference_number, '') || ' ' || w.brand_name || ' ' || w.series_name,
      cleaned
    ) desc,
    w.brand_name,
    w.series_name,
    w.reference_number nulls last
  limit lim;
end;
$$;

revoke all on function public.suggest_watches(text, text, integer) from public, anon;
grant execute on function public.suggest_watches(text, text, integer) to authenticated;

revoke all on table public.watch_models from anon;
grant select on table public.watch_models to authenticated;
