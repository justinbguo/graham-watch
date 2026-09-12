create type public.listing_status as enum ('active', 'hidden');
create type public.import_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.swipe_direction as enum ('left', 'right');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_url text not null,
  provider text not null,
  status public.import_status not null default 'queued',
  error text,
  listings_created integer not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  import_job_id uuid references public.import_jobs (id) on delete set null,
  source_url text,
  brand text not null,
  model text,
  reference text,
  year integer,
  movement text,
  case_size_mm numeric(5, 2),
  condition text,
  has_box boolean,
  has_papers boolean,
  price_cents bigint,
  currency text not null default 'USD',
  description text,
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null,
  position integer not null default 0,
  unique (listing_id, position)
);

create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  direction public.swipe_direction not null,
  created_at timestamptz not null default now(),
  unique (actor_id, listing_id)
);

create index listings_deck_idx on public.listings (status, created_at desc);
create index listings_seller_idx on public.listings (seller_id);
create index listing_photos_listing_idx on public.listing_photos (listing_id);
create index swipes_actor_idx on public.swipes (actor_id, created_at desc);
create index import_jobs_user_idx on public.import_jobs (user_id, created_at desc);

-- Give every new auth user a profile row so the app never has to create one.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
