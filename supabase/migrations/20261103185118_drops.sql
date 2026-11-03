-- Drops: a buyer who follows a shop hears when that shop lists a watch.
--
-- The nightly catalogue refresh inserts listings. This migration does not send
-- the push. It stores three things the app and the notify-drops function share:
--
-- * drop_notifications — one row per buyer per UTC day, the watches in that
--   push, and when they opened it. The unique day is the 1-a-day cap. The
--   listing ids are the dedupe, so a later night does not push the same watch.
-- * drop_views — a watch from a followed shop the buyer has already looked at.
--   The Profile count is the listings created after the follow that are not
--   in this table. Opening the shop, or the New feed, writes the rows.
--
-- Buyers read and write only their own rows. Inserts into the log are the
-- service role (the edge function). There is no insert policy for the app.

create table public.drop_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_ids uuid[] not null,
  dealer_ids uuid[] not null,
  title text not null,
  body text not null,
  destination text not null,
  -- Null when the push names more than one shop, or the shop was later deleted.
  -- on delete set null keeps the log (and its open stamp) when an operator
  -- removes a shop. A check that dealer rows must have a dealer_id would block
  -- that delete.
  dealer_id uuid references public.dealers (id) on delete set null,
  status text not null default 'pending',
  expo_ticket_ids text[] not null default '{}',
  notified_on date not null default ((timezone('utc', now()))::date),
  notified_through timestamptz not null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  constraint drop_notifications_status check (status in ('pending', 'sent', 'failed')),
  constraint drop_notifications_destination check (destination in ('dealer', 'drops')),
  constraint drop_notifications_has_listings check (cardinality(listing_ids) > 0),
  constraint drop_notifications_has_dealers check (cardinality(dealer_ids) > 0),
  constraint drop_notifications_one_a_day unique (user_id, notified_on)
);

create index drop_notifications_user_idx
  on public.drop_notifications (user_id, notified_on desc);

alter table public.drop_notifications enable row level security;

create policy "you read your own drop notifications"
on public.drop_notifications for select to authenticated
using (user_id = (select auth.uid()));

-- UPDATE needs a SELECT policy or Postgres changes zero rows and reports success.
create policy "you mark your own drop opened"
on public.drop_notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.drop_notifications from anon, public, authenticated;
grant select on public.drop_notifications to authenticated;
-- The opened stamp is the only column the app may change. The log itself is
-- written by the service role, which bypasses RLS.
grant update (opened_at) on public.drop_notifications to authenticated;

comment on table public.drop_notifications is
  'One push per buyer per UTC day about new watches from shops they follow. listing_ids is the dedupe. opened_at is the open.';

create table public.drop_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.drop_views enable row level security;

create policy "you read your own drop views"
on public.drop_views for select to authenticated
using (user_id = (select auth.uid()));

-- A view is only for a watch this account can already read. Hidden rows are
-- not readable, and mark_drops_seen only writes the rows the count uses, so
-- the check and the insert agree. A stranger's user_id fails the first line.
create policy "you record your own drop views"
on public.drop_views for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.listings l
    where l.id = listing_id
  )
);

revoke all on public.drop_views from anon, public, authenticated;
grant select, insert on public.drop_views to authenticated;

comment on table public.drop_views is
  'Watches from followed shops this buyer has already seen. The unseen count is the rest.';

-- The badge query is "new listings for the shops I follow, newest last".
-- listings_dealer_idx is dealer_id alone. This one also serves the date order.
create index listings_dealer_created_idx
  on public.listings (dealer_id, created_at desc);

/**
 * How many unseen new watches each followed shop has for the signed-in buyer.
 *
 * New means the listing was created after the follow. The back catalogue of a
 * shop you just followed is not a drop. Sold and hidden watches are not either.
 * security invoker so the listing policy still applies: a paused shop drops
 * out because its watches are not readable.
 */
create function public.unseen_drops_by_dealer()
returns table (dealer_id uuid, unseen integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.dealer_id, count(l.id)::integer as unseen
  from public.dealer_follows f
  join public.dealers d
    on d.id = f.dealer_id
   and d.permission = 'approved'
  join public.listings l
    on l.dealer_id = f.dealer_id
   and l.status = 'active'
   and l.sold_at is null
   and l.created_at > f.created_at
  where f.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.drop_views v
      where v.user_id = f.user_id
        and v.listing_id = l.id
    )
  group by f.dealer_id;
$$;

create function public.unseen_drop_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(tally.unseen), 0)::integer
  from public.unseen_drops_by_dealer() as tally;
$$;

/**
 * The newest watches listed after the buyer followed, whether or not the
 * badge still counts them. Opening the feed marks them seen; the list stays
 * so the screen is not empty on the frame the count clears.
 */
create function public.followed_new_listing_ids()
returns table (id uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.created_at
  from public.listings l
  join public.dealer_follows f
    on f.dealer_id = l.dealer_id
   and f.user_id = (select auth.uid())
  join public.dealers d
    on d.id = l.dealer_id
   and d.permission = 'approved'
  where l.status = 'active'
    and l.sold_at is null
    and l.created_at > f.created_at
  order by l.created_at desc, l.id desc
  limit 100;
$$;

/**
 * The buyer opened a shop, or the New feed. Writes a view for every watch
 * the badge would have counted. p_dealer_id limits that to one shop.
 *
 * Returns how many new view rows were written. A second call writes nothing.
 */
create function public.mark_drops_seen(p_dealer_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inserted integer;
begin
  if uid is null then
    raise exception 'sign in to update drops' using errcode = '28000';
  end if;

  insert into public.drop_views (user_id, listing_id)
  select uid, l.id
  from public.listings l
  join public.dealer_follows f
    on f.dealer_id = l.dealer_id
   and f.user_id = uid
  join public.dealers d
    on d.id = l.dealer_id
   and d.permission = 'approved'
  where l.status = 'active'
    and l.sold_at is null
    and l.created_at > f.created_at
    and (p_dealer_id is null or l.dealer_id = p_dealer_id)
  on conflict do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

/**
 * The buyer tapped the push. The first open wins; a later call does not move
 * the stamp. A stranger's id matches no row.
 */
create function public.record_drop_opened(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or p_id is null then
    return;
  end if;

  update public.drop_notifications
  set opened_at = now()
  where id = p_id
    and user_id = uid
    and opened_at is null;
end;
$$;

-- A signed-in update may only stamp opened_at, and only the first time.
-- auth.uid() is null for the service role, which is who sets status and tickets
-- after the send. That path is left alone.
create function public.drop_notifications_touch_opened()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.listing_ids is distinct from old.listing_ids
    or new.dealer_ids is distinct from old.dealer_ids
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.destination is distinct from old.destination
    or new.dealer_id is distinct from old.dealer_id
    or new.status is distinct from old.status
    or new.expo_ticket_ids is distinct from old.expo_ticket_ids
    or new.notified_on is distinct from old.notified_on
    or new.notified_through is distinct from old.notified_through
    or new.sent_at is distinct from old.sent_at
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id
  then
    raise exception 'a drop notification is only marked opened';
  end if;

  if old.opened_at is not null then
    new.opened_at := old.opened_at;
  elsif new.opened_at is not null then
    new.opened_at := now();
  end if;

  return new;
end;
$$;

create trigger drop_notifications_opened
before update on public.drop_notifications
for each row
execute function public.drop_notifications_touch_opened();

revoke all on function public.unseen_drops_by_dealer() from public, anon;
revoke all on function public.unseen_drop_count() from public, anon;
revoke all on function public.followed_new_listing_ids() from public, anon;
revoke all on function public.mark_drops_seen(uuid) from public, anon;
revoke all on function public.record_drop_opened(uuid) from public, anon;
revoke all on function public.drop_notifications_touch_opened() from public, anon, authenticated;

grant execute on function public.unseen_drops_by_dealer() to authenticated;
grant execute on function public.unseen_drop_count() to authenticated;
grant execute on function public.followed_new_listing_ids() to authenticated;
grant execute on function public.mark_drops_seen(uuid) to authenticated;
grant execute on function public.record_drop_opened(uuid) to authenticated;
