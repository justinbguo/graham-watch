-- A comment names whether the person is buying, selling, or trading, so
-- the thread can be filtered the same way as the feed.

alter table public.exchange_comments
  add column intent public.exchange_intent;

update public.exchange_comments c
set intent = p.intent
from public.exchange_posts p
where p.id = c.post_id
  and c.intent is null;

alter table public.exchange_comments
  alter column intent set not null;
