-- A message may be a photograph. The file lives in a private bucket, and the
-- row only points at it. The path is the conversation, then the sender, then
-- this message, so a row cannot name someone else's file.

alter table public.messages
  add column if not exists photo_path text;

alter table public.messages drop constraint if exists messages_body_len;

alter table public.messages
  add constraint messages_body_len check (
    char_length(body) <= 4000
    and (char_length(btrim(body)) >= 1 or photo_path is not null)
  );

alter table public.messages drop constraint if exists messages_photo_path;

alter table public.messages
  add constraint messages_photo_path check (
    photo_path is null
    or photo_path = conversation_id::text || '/' || sender_id::text || '/' || id::text || '.jpg'
    or photo_path = conversation_id::text || '/' || sender_id::text || '/' || id::text || '.png'
    or photo_path = conversation_id::text || '/' || sender_id::text || '/' || id::text || '.webp'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-photos',
  'message-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "you read photos in your conversations" on storage.objects;
create policy "you read photos in your conversations"
on storage.objects for select to authenticated
using (
  bucket_id = 'message-photos'
  and public.in_conversation((split_part(name, '/', 1))::uuid)
);

drop policy if exists "you add a photo to a conversation you can write in" on storage.objects;
create policy "you add a photo to a conversation you can write in"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-photos'
  and split_part(name, '/', 2) = (select auth.uid())::text
  and public.conversation_writable((split_part(name, '/', 1))::uuid)
);

drop policy if exists "you remove a photo you uploaded" on storage.objects;
create policy "you remove a photo you uploaded"
on storage.objects for delete to authenticated
using (
  bucket_id = 'message-photos'
  and split_part(name, '/', 2) = (select auth.uid())::text
);
