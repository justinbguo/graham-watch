-- Profile photos the owner picked. Google/Apple already stash a URL on
-- profiles.avatar_url; this bucket is for people who sign in with email, or
-- who want a different picture than the provider sent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  -- Public: the path is `{user_id}/avatar.*`, and profiles are owner-only, so
  -- a stranger never learns the URL from the app. Public read means expo-image
  -- can fetch without a signed URL that would expire mid-session.
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "avatars are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

-- First path segment is the owner's uuid. Anyone who could write into another
-- folder would put a file at a URL that owner's profile might later point at.
create policy "users insert their own avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "users update their own avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "users delete their own avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
