-- A vote has a direction, and a post says who wrote it.
--
-- An upvote on its own can only say "worth answering". On a board of
-- strangers the reader also needs the other answer: a price nobody would pay
-- and an offer nobody trusts both sit at zero votes, and they are not the
-- same thing.

alter table public.exchange_votes
  add column value smallint not null default 1
  constraint exchange_votes_value check (value in (1, -1));

-- One way to vote. Changing direction is an update, and an update has to
-- upsert against a partial index, naming that index's predicate — which
-- PostgREST cannot express from the client. So the client calls the function
-- below and stops writing this table.
drop policy "you vote as yourself" on public.exchange_votes;
drop policy "you take back your own vote" on public.exchange_votes;
revoke insert, delete on public.exchange_votes from authenticated;

create function public.exchange_vote(
  p_post_id uuid,
  p_comment_id uuid,
  p_value smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to vote';
  end if;

  if (p_post_id is null) = (p_comment_id is null) then
    raise exception 'a vote names one post or one comment';
  end if;

  if p_value is null or p_value not in (-1, 0, 1) then
    raise exception 'a vote is up, down, or taken back';
  end if;

  -- Zero is taking it back. A stored zero would be a third state that counts
  -- for nothing and still has to be read.
  if p_value = 0 then
    delete from public.exchange_votes v
    where v.user_id = uid
      and v.post_id is not distinct from p_post_id
      and v.comment_id is not distinct from p_comment_id;
    return;
  end if;

  if p_post_id is not null then
    insert into public.exchange_votes (user_id, post_id, value)
    values (uid, p_post_id, p_value)
    on conflict (user_id, post_id) where post_id is not null
    do update set value = excluded.value;
  else
    insert into public.exchange_votes (user_id, comment_id, value)
    values (uid, p_comment_id, p_value)
    on conflict (user_id, comment_id) where comment_id is not null
    do update set value = excluded.value;
  end if;
end;
$$;

revoke all on function public.exchange_vote(uuid, uuid, smallint) from public, anon;
grant execute on function public.exchange_vote(uuid, uuid, smallint) to authenticated;

-- `voted` becomes `my_vote`: which way this person voted, or 0. A boolean
-- cannot answer that with two directions on the board.
--
-- Both functions become security definer, because a post now shows its
-- author's name and photograph and `profiles` is readable only by its owner.
-- The name and the photograph are what a public board needs to name a person;
-- nothing else about them leaves these functions.
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

drop function public.exchange_thread(uuid);

create function public.exchange_thread(p_post_id uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
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
    c.body,
    c.created_at,
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
  left join public.profiles a on a.id = c.author_id
  where c.post_id = p_post_id
  order by c.created_at;
$$;

revoke all on function public.exchange_thread(uuid) from public, anon;
grant execute on function public.exchange_thread(uuid) to authenticated;

-- The post's own author, name and photograph included, without handing the
-- whole thread back. The row itself is readable; its author's profile is not.
create function public.exchange_post_author(p_post_id uuid)
returns table (
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
