-- Imported photos were hot-linked straight from the dealer's server. That spends
-- their bandwidth, breaks every card the day they reorganise their CDN, and
-- leaks our users' IP addresses to them. Copy the files instead.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  -- Public: these images are already served publicly from the dealer's own site,
  -- and paths are listing UUIDs so they cannot be enumerated. The thing worth
  -- protecting is which listings appear in a deck, and that is table RLS.
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do nothing;

-- Only the importer writes here, and it runs as the service role, which bypasses
-- RLS. No policy grants write to end users on purpose.
create policy "listing photos are publicly readable"
on storage.objects for select
using (bucket_id = 'listing-photos');

-- Where the file came from, so a re-import can tell "already copied" from
-- "changed upstream", and so provenance survives.
alter table public.listing_photos
  add column source_url text;
