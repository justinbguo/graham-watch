-- Upvotes on posts and comments. One per person per thing, and the count is
-- public: on a board of strangers a vote is the only thing that says other
-- collectors think an offer is worth answering.

create table public.exchange_votes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.exchange_posts (id) on delete cascade,
  comment_id uuid references public.exchange_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Exactly one target. A row pointing at both is a row nothing can count.
  constraint exchange_votes_one_target check ((post_id is null) <> (comment_id is null))
);

-- Partial, because a null target is not a duplicate of another null target.
create unique index exchange_votes_post_idx
  on public.exchange_votes (user_id, post_id)
  where post_id is not null;

create unique index exchange_votes_comment_idx
  on public.exchange_votes (user_id, comment_id)
  where comment_id is not null;

create index exchange_votes_by_post_idx
  on public.exchange_votes (post_id)
  where post_id is not null;

create index exchange_votes_by_comment_idx
  on public.exchange_votes (comment_id)
  where comment_id is not null;

alter table public.exchange_votes enable row level security;

create policy "exchange votes are readable when signed in"
on public.exchange_votes for select to authenticated
using (true);

create policy "you vote as yourself"
on public.exchange_votes for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "you take back your own vote"
on public.exchange_votes for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on public.exchange_votes from anon, public;
grant select, insert, delete on public.exchange_votes to authenticated;

-- The delete trigger now clears votes as well as photos, so it is named for
-- the job rather than for one of its children.
drop trigger exchange_posts_clear_photos on public.exchange_posts;
drop function public.exchange_posts_clear_photos();

-- Runs as the owner, before the post row is gone, so rows belonging to other
-- people — their votes on this post and on its comments — still go.
create function public.exchange_posts_clear_children()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.exchange_votes v
  where v.post_id = old.id
     or v.comment_id in (
       select c.id from public.exchange_comments c where c.post_id = old.id
     );
  delete from public.exchange_photos where post_id = old.id;
  return old;
end;
$$;

create trigger exchange_posts_clear_children
before delete on public.exchange_posts
for each row
execute function public.exchange_posts_clear_children();

revoke all on function public.exchange_posts_clear_children() from public, anon, authenticated;

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
  vote_count bigint,
  voted boolean,
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
    (select count(*) from public.exchange_votes v where v.post_id = p.id),
    exists (
      select 1
      from public.exchange_votes v
      where v.post_id = p.id and v.user_id = (select auth.uid())
    ),
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

-- The comments on one post, with their counts. A plain select cannot say how
-- many people voted for a comment without a second round trip per row.
create function public.exchange_thread(p_post_id uuid)
returns table (
  id uuid,
  intent public.exchange_intent,
  body text,
  created_at timestamptz,
  author_handle text,
  author_number integer,
  vote_count bigint,
  voted boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.intent,
    c.body,
    c.created_at,
    c.author_handle,
    c.author_number,
    (select count(*) from public.exchange_votes v where v.comment_id = c.id),
    exists (
      select 1
      from public.exchange_votes v
      where v.comment_id = c.id and v.user_id = (select auth.uid())
    )
  from public.exchange_comments c
  where c.post_id = p_post_id
  order by c.created_at;
$$;

revoke all on function public.exchange_thread(uuid) from public, anon;
grant execute on function public.exchange_thread(uuid) to authenticated;
