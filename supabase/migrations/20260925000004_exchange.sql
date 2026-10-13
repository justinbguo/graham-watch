-- Peer-to-peer posts. Graham is the notice board: anyone signed in can read
-- a post and comment on it. Payment and shipping stay between the two people,
-- so there is no checkout, no escrow, and no delete. A sold post is the record.

create type public.exchange_intent as enum ('sell', 'buy', 'trade');

create table public.exchange_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- Copied at insert. Profiles are readable only by their owner, and a post
  -- has to name its author to everyone else.
  author_handle text,
  author_number integer not null,
  intent public.exchange_intent not null,
  title text not null,
  price_cents integer,
  currency text not null default 'USD',
  body text not null,
  created_at timestamptz not null default now(),
  constraint exchange_posts_title_len check (char_length(btrim(title)) between 3 and 80),
  constraint exchange_posts_body_len check (char_length(btrim(body)) between 1 and 4000),
  constraint exchange_posts_price_nonneg check (price_cents is null or price_cents >= 0),
  constraint exchange_posts_sell_has_price check (intent <> 'sell' or price_cents is not null)
);

create table public.exchange_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.exchange_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_handle text,
  author_number integer not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint exchange_comments_body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index exchange_posts_created_at_idx on public.exchange_posts (created_at desc);
create index exchange_comments_post_id_idx on public.exchange_comments (post_id, created_at);

create function public.exchange_stamp_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or new.author_id is distinct from uid then
    raise exception 'you can only write as yourself';
  end if;

  select p.handle, p.collector_number
    into new.author_handle, new.author_number
  from public.profiles p
  where p.id = uid;

  if new.author_number is null then
    raise exception 'your account is not ready to post';
  end if;

  return new;
end;
$$;

create trigger exchange_posts_stamp_author
before insert on public.exchange_posts
for each row
execute function public.exchange_stamp_author();

create trigger exchange_comments_stamp_author
before insert on public.exchange_comments
for each row
execute function public.exchange_stamp_author();

alter table public.exchange_posts enable row level security;
alter table public.exchange_comments enable row level security;

create policy "exchange posts are readable when signed in"
on public.exchange_posts for select to authenticated
using (true);

create policy "you post as yourself"
on public.exchange_posts for insert to authenticated
with check (author_id = (select auth.uid()));

create policy "exchange comments are readable when signed in"
on public.exchange_comments for select to authenticated
using (true);

create policy "you comment as yourself"
on public.exchange_comments for insert to authenticated
with check (author_id = (select auth.uid()));

revoke all on public.exchange_posts from anon, public;
revoke all on public.exchange_comments from anon, public;
grant select, insert on public.exchange_posts to authenticated;
grant select, insert on public.exchange_comments to authenticated;

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
  comment_count bigint
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
    (select count(*) from public.exchange_comments c where c.post_id = p.id)
  from public.exchange_posts p
  order by p.created_at desc
  limit 100;
$$;

revoke all on function public.exchange_stamp_author() from public, anon, authenticated;
revoke all on function public.exchange_feed() from public, anon;
grant execute on function public.exchange_feed() to authenticated;
