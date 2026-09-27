-- A comment can answer another comment, and every author can be written to.
--
-- One level of nesting and no more. A thread about one watch is a handful of
-- questions and their answers; a tree deep enough to need a line down the left
-- margin is a tree nobody can follow on a phone. A reply to a reply attaches
-- to the same root, which is what the trigger below does.

alter table public.exchange_comments
  add column parent_id uuid references public.exchange_comments (id) on delete cascade;

create index exchange_comments_parent_idx on public.exchange_comments (parent_id, created_at);

create function public.exchange_comment_root()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  root uuid;
  root_post uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select coalesce(c.parent_id, c.id), c.post_id
    into root, root_post
  from public.exchange_comments c
  where c.id = new.parent_id;

  if root is null then
    raise exception 'that comment is gone';
  end if;

  if root_post is distinct from new.post_id then
    raise exception 'a reply stays on the post it answers';
  end if;

  new.parent_id := root;
  return new;
end;
$$;

create trigger exchange_comments_root
before insert on public.exchange_comments
for each row
execute function public.exchange_comment_root();

revoke all on function public.exchange_comment_root() from public, anon, authenticated;

-- The author's id joins the name and the photograph these functions already
-- return: without it a reader can see who wrote a post and has no way to
-- write to them.
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
  author_id uuid,
  author_handle text,
  author_number integer,
  author_name text,
  author_avatar_url text,
  comment_count bigint,
  vote_count bigint,
  my_vote smallint,
  cover_path text
)
language sql
stable
security definer
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
    p.author_id,
    p.author_handle,
    p.author_number,
    nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
    a.avatar_url,
    (select count(*) from public.exchange_comments c where c.post_id = p.id),
    coalesce((select sum(v.value) from public.exchange_votes v where v.post_id = p.id), 0),
    coalesce(
      (
        select v.value
        from public.exchange_votes v
        where v.post_id = p.id and v.user_id = (select auth.uid())
      ),
      0::smallint
    ),
    (
      select ph.storage_path
      from public.exchange_photos ph
      where ph.post_id = p.id
      order by ph.position
      limit 1
    )
  from public.exchange_posts p
  left join public.profiles a on a.id = p.author_id
  order by p.created_at desc
  limit 100;
$$;

revoke all on function public.exchange_feed() from public, anon;
grant execute on function public.exchange_feed() to authenticated;

-- Replies come back in reading order: each root in the order it was written,
-- its answers under it. A client that sorted this itself would have to know
-- the rule, and the rule belongs next to the data.
drop function public.exchange_thread(uuid);

create function public.exchange_thread(p_post_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  author_id uuid,
  author_handle text,
  author_number integer,
  author_name text,
  author_avatar_url text,
  vote_count bigint,
  my_vote smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.parent_id,
    c.body,
    c.created_at,
    c.author_id,
    c.author_handle,
    c.author_number,
    nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
    a.avatar_url,
    coalesce((select sum(v.value) from public.exchange_votes v where v.comment_id = c.id), 0),
    coalesce(
      (
        select v.value
        from public.exchange_votes v
        where v.comment_id = c.id and v.user_id = (select auth.uid())
      ),
      0::smallint
    )
  from public.exchange_comments c
  left join public.exchange_comments r on r.id = c.parent_id
  left join public.profiles a on a.id = c.author_id
  where c.post_id = p_post_id
  order by coalesce(r.created_at, c.created_at), (c.parent_id is not null), c.created_at;
$$;

revoke all on function public.exchange_thread(uuid) from public, anon;
grant execute on function public.exchange_thread(uuid) to authenticated;

drop function public.exchange_post_author(uuid);

create function public.exchange_post_author(p_post_id uuid)
returns table (
  author_id uuid,
  author_handle text,
  author_number integer,
  author_name text,
  author_avatar_url text,
  vote_count bigint,
  my_vote smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.author_id,
    p.author_handle,
    p.author_number,
    nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), ''),
    a.avatar_url,
    coalesce((select sum(v.value) from public.exchange_votes v where v.post_id = p.id), 0),
    coalesce(
      (
        select v.value
        from public.exchange_votes v
        where v.post_id = p.id and v.user_id = (select auth.uid())
      ),
      0::smallint
    )
  from public.exchange_posts p
  left join public.profiles a on a.id = p.author_id
  where p.id = p_post_id;
$$;

revoke all on function public.exchange_post_author(uuid) from public, anon;
grant execute on function public.exchange_post_author(uuid) to authenticated;
