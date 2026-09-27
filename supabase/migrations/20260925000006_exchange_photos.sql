-- Photos on an exchange post, and the author's right to change or remove
-- their own. A buying post has to show a picture: the check waits until the
-- end of the save, so the post and its photos can be written together.

create table public.exchange_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.exchange_posts (id) on delete cascade,
  storage_path text not null,
  position integer not null,
  unique (post_id, position)
);

create index exchange_photos_post_id_idx on public.exchange_photos (post_id, position);

alter table public.exchange_photos enable row level security;

create policy "exchange photos are readable when signed in"
on public.exchange_photos for select to authenticated
using (true);

revoke all on public.exchange_photos from anon, public;
grant select on public.exchange_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exchange-photos',
  'exchange-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "exchange photos are publicly readable"
on storage.objects for select
using (bucket_id = 'exchange-photos');

create policy "you upload your own exchange photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exchange-photos'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "you replace your own exchange photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'exchange-photos'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'exchange-photos'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "you remove your own exchange photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'exchange-photos'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

grant delete on public.exchange_posts to authenticated;

create policy "you delete your own exchange post"
on public.exchange_posts for delete to authenticated
using (author_id = (select auth.uid()));

-- Runs as the owner, before the post row is gone, so the photo rows do not
-- have to be deletable by the signed-in user.
create function public.exchange_posts_clear_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.exchange_photos where post_id = old.id;
  return old;
end;
$$;

create trigger exchange_posts_clear_photos
before delete on public.exchange_posts
for each row
execute function public.exchange_posts_clear_photos();

revoke all on function public.exchange_posts_clear_photos() from public, anon, authenticated;

create function public.exchange_buy_needs_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.intent = 'buy' and not exists (
    select 1 from public.exchange_photos ph where ph.post_id = new.id
  ) then
    raise exception 'a buying post needs a photo';
  end if;
  return new;
end;
$$;

create constraint trigger exchange_buy_needs_photo
after insert or update on public.exchange_posts
deferrable initially deferred
for each row
execute function public.exchange_buy_needs_photo();

revoke all on function public.exchange_buy_needs_photo() from public, anon, authenticated;

create function public.save_exchange_post(
  p_post_id uuid default null,
  p_intent public.exchange_intent default null,
  p_title text default null,
  p_body text default null,
  p_price_cents integer default null,
  p_photo_paths text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  saved uuid := p_post_id;
  path text;
  n integer := 0;
begin
  if uid is null then
    raise exception 'sign in to post';
  end if;
  if p_intent is null or p_title is null or p_body is null then
    raise exception 'a post needs an intent, a title, and a description';
  end if;
  if coalesce(cardinality(p_photo_paths), 0) > 6 then
    raise exception 'six photos is the limit';
  end if;
  if p_intent = 'buy' and coalesce(cardinality(p_photo_paths), 0) < 1 then
    raise exception 'a buying post needs a photo';
  end if;

  foreach path in array coalesce(p_photo_paths, '{}') loop
    if split_part(path, '/', 1) is distinct from uid::text or path like '%..%' then
      raise exception 'that photo is not yours';
    end if;
  end loop;

  if saved is null then
    insert into public.exchange_posts (author_id, intent, title, body, price_cents)
    values (uid, p_intent, btrim(p_title), btrim(p_body), p_price_cents)
    returning id into saved;
  else
    update public.exchange_posts
    set intent = p_intent,
        title = btrim(p_title),
        body = btrim(p_body),
        price_cents = p_price_cents
    where id = saved and author_id = uid;
    if not found then
      raise exception 'you can only edit your own post';
    end if;
    delete from public.exchange_photos where post_id = saved;
  end if;

  foreach path in array coalesce(p_photo_paths, '{}') loop
    insert into public.exchange_photos (post_id, storage_path, position)
    values (saved, path, n);
    n := n + 1;
  end loop;

  return saved;
end;
$$;

revoke all on function public.save_exchange_post(uuid, public.exchange_intent, text, text, integer, text[]) from public, anon;
grant execute on function public.save_exchange_post(uuid, public.exchange_intent, text, text, integer, text[]) to authenticated;

drop function public.exchange_feed();

create function public.exchange_feed()
returns table (
  id uuid,
  intent public.exchange_intent,
  title text,
  price_cents integer,
  currency text,
  body text,
  created_at timestamptz,
  author_handle text,
  author_number integer,
  comment_count bigint,
  cover_path text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.intent,
    p.title,
    p.price_cents,
    p.currency,
    p.body,
    p.created_at,
    p.author_handle,
    p.author_number,
    (select count(*) from public.exchange_comments c where c.post_id = p.id),
    (
      select ph.storage_path
      from public.exchange_photos ph
      where ph.post_id = p.id
      order by ph.position
      limit 1
    )
  from public.exchange_posts p
  order by p.created_at desc
  limit 100;
$$;

revoke all on function public.exchange_feed() from public, anon;
grant execute on function public.exchange_feed() to authenticated;
