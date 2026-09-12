-- listing_photos.url held a ready-made display URL, so the edge function wrote the
-- only address it knows for itself: http://kong:8000, its own container. Nothing
-- outside Docker can reach that. An absolute URL is an environment baked into
-- data, and it rots on every move between local, staging and production.
--
-- Store facts instead: where the photo came from, and where our copy lives. The
-- reader builds a URL from the Supabase client it already holds.
alter table public.listing_photos
  add column storage_path text;

update public.listing_photos
set source_url = coalesce(source_url, url);

alter table public.listing_photos
  alter column source_url set not null;

alter table public.listing_photos
  drop column url;
