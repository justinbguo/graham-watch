-- Every post needs a photo. Buying already did. A selling or trading post
-- without one is a title with nothing to look at. The check stays deferred
-- so the post row can be written before its photos, in the same transaction.
-- Rows already saved without a photo stay until someone edits them.

create or replace function public.exchange_post_needs_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.exchange_photos ph where ph.post_id = new.id
  ) then
    raise exception 'a post needs a photo';
  end if;
  return new;
end;
$$;

drop trigger if exists exchange_buy_needs_photo on public.exchange_posts;
drop function if exists public.exchange_buy_needs_photo();

create constraint trigger exchange_post_needs_photo
after insert or update on public.exchange_posts
deferrable initially deferred
for each row
execute function public.exchange_post_needs_photo();

revoke all on function public.exchange_post_needs_photo() from public, anon, authenticated;

create or replace function public.save_exchange_post(
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
  if coalesce(cardinality(p_photo_paths), 0) < 1 then
    raise exception 'a post needs a photo';
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
