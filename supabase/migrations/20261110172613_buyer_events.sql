-- buyer_events is what buyers did, in the order they did it, for a ranker that
-- does not exist yet. swipes, dealer_follows, and inquiries keep the current
-- state. This table keeps the history.
--
-- Sealed like catalogue_batches. RLS is on, there are no policies, and every
-- client grant is revoked. The app writes through one function,
-- log_buyer_events, which names the buyer from the JWT. The ranker reads with
-- the service role. dealer_stats and dealer_top_customers do not read it, and
-- scripts/test-rls.mjs checks that their output does not change when a buyer
-- logs events against a shop's watch.

create type public.buyer_event_kind as enum (
  'impression',     -- a card came on screen
  'dwell',          -- that card left the screen
  'save',
  'pass',
  'unsave',
  'undo',
  'dealer_click',   -- View on dealer site
  'inquiry_open',   -- the mail draft to a shop
  'follow',
  'unfollow',
  'filter'
);

create type public.buyer_event_surface as enum (
  'buy',            -- the Buy card pile, and filters on the deck
  'buy_grid',       -- the Buy grid
  'search',
  'new',
  'drops',
  'detail',         -- listing/[listingId]
  'viewer',         -- photos/[listingId]
  'wishlist',
  'shop',           -- dealer/[dealerId]
  'profile',        -- Following
  'messages'
);

create table public.buyer_events (
  -- Made on the device. A replayed batch carries the same ids, and
  -- log_buyer_events skips the rows already stored.
  id uuid primary key,
  -- auth.uid() at the time of the write, set by log_buyer_events.
  --
  -- The one foreign key, and the one delete. Deleting an account erases that
  -- person's events. That is erasure, not editing. No client can change or
  -- remove a row, and nothing about a watch or a shop ever removes one.
  --
  -- A JWT outlives delete_own_account by up to an hour, and a batch sent with
  -- it fails the key check (23503) instead of leaving rows for someone who is
  -- gone. A batch that races the delete takes the key's share lock on the
  -- auth.users row, so the delete waits for it and then cascades over it.
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.buyer_event_kind not null,
  surface public.buyer_event_surface not null,
  -- The device clock. A guest's events arrive at sign-in, days later, with
  -- their original times. Not checked against now(). A phone with a wrong
  -- clock would fail every batch it ever sent.
  occurred_at timestamptz not null,
  -- The server clock. The ranker pulls new rows by this column. Pulling by
  -- occurred_at would miss a guest flush that lands behind the watermark.
  received_at timestamptz not null default now(),
  -- No foreign keys. A deleted watch or shop keeps its history. A cascade here
  -- would edit the log, and restrict would block listing deletion.
  listing_id uuid,
  dealer_id uuid,
  -- One showing of one card. Its impression, its dwell, and whatever the buyer
  -- did to it while it was up share this id.
  exposure_id uuid,
  -- 0-based place in the order the surface presented its cards.
  position integer,
  dwell_ms integer,
  -- The highest photo index the buyer reached during the showing.
  photo_index smallint,
  -- The canonical filter spec (`canonicalize(filters).spec`), never the panel state.
  filter jsonb,
  -- Set only on rows flushed from a signed-out session, one key per session.
  -- Null when the buyer was already signed in.
  guest_key uuid,

  -- One shape per kind. Every comparison here is between two non-null
  -- booleans, so a null column fails a check instead of passing it. `toRow` in
  -- src/data/listingEventQueue.ts is the TypeScript half.
  constraint buyer_events_listing check (
    (kind in ('impression', 'dwell', 'save', 'pass', 'unsave', 'undo', 'dealer_click', 'inquiry_open'))
    = (listing_id is not null)
  ),
  constraint buyer_events_dealer check (
    case
      when kind = 'filter' then (surface = 'shop') = (dealer_id is not null)
      else dealer_id is not null
    end
  ),
  constraint buyer_events_exposure check (
    case
      when kind in ('impression', 'dwell') then exposure_id is not null
      else exposure_id is null or listing_id is not null
    end
  ),
  constraint buyer_events_position check (
    position is null or (kind = 'impression' and position >= 0)
  ),
  constraint buyer_events_dwell check (
    (kind = 'dwell') = (dwell_ms is not null)
    and (dwell_ms is null or dwell_ms between 0 and 1800000)
  ),
  constraint buyer_events_photo check (
    photo_index is null or (kind = 'dwell' and photo_index >= 0)
  ),
  constraint buyer_events_filter check (
    (kind = 'filter') = (filter is not null)
    and (kind <> 'filter' or surface in ('buy', 'search', 'shop'))
    and (filter is null or (jsonb_typeof(filter) = 'object' and octet_length(filter::text) <= 2048))
  )
);

-- The cascade on account deletion, and the ranker's per-buyer sequence.
create index buyer_events_user_time_idx
  on public.buyer_events (user_id, occurred_at);

-- The ranker's incremental pull. Rows arrive in received_at order, so a block
-- range index stays small and still skips everything older than the watermark.
create index buyer_events_received_brin
  on public.buyer_events using brin (received_at);

alter table public.buyer_events enable row level security;

-- No policies. Supabase grants anon, authenticated, and service_role full rights
-- on a new table, so they are all taken back here. RLS with no select policy
-- would still answer 200 [] while a select grant remains. Revoked, a read is a 4xx.
revoke all on public.buyer_events from public, anon, authenticated, service_role;
grant select on public.buyer_events to service_role;

comment on table public.buyer_events is
  'Append-only buyer behavior for a future ranker. Written only by log_buyer_events, read only by service_role. Account deletion cascades. Listing and shop deletion does not.';

comment on column public.buyer_events.guest_key is
  'Set only on rows flushed from a signed-out session. Null when the buyer was already signed in.';

/**
 * The app's only way in. Takes a JSON array of events and stores each one under
 * the caller.
 *
 * Why security definer. authenticated holds no privilege on the table, so a
 * client cannot insert at all, and this function is the only write path. A
 * retry has to be idempotent, which is the targetless `on conflict do nothing`
 * below. PostgREST cannot express that: its ignore-duplicates upsert names a
 * conflict target, and Postgres requires a select grant on a named target's
 * columns. That grant is the one this table must never give a client.
 *
 * Definer widens nothing else. search_path is empty and every name is
 * qualified. The function reads only auth.uid(), and it writes only rows
 * stamped with that id. It lives in public because that is the schema the app
 * calls through PostgREST.
 *
 * user_id and received_at are overwritten from the JWT and the clock, so a
 * client that sends them is ignored and cannot slip under the ranker's
 * watermark. guest_key is kept as sent. jsonb_populate_record uses the table's
 * own row type, so this function has no column list to keep in step with the
 * table. A bad value fails the whole batch with a class 22 or 23 error. The
 * client drops a batch that fails that way rather than retrying it forever.
 *
 * Idempotent per row. A replayed batch, or a batch that overlaps one already
 * stored, inserts only the new ids and returns how many that was.
 */
create function public.log_buyer_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  stored integer;
begin
  if uid is null then
    raise exception 'sign in to log events' using errcode = '28000';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) > 100 then
    raise exception 'events must be an array of at most 100' using errcode = '22023';
  end if;

  insert into public.buyer_events
  select r.*
  from jsonb_array_elements(p_events) as e,
       lateral jsonb_populate_record(
         null::public.buyer_events,
         e || jsonb_build_object('user_id', uid, 'received_at', now())
       ) as r
  on conflict do nothing;

  get diagnostics stored = row_count;
  return stored;
end;
$$;

revoke all on function public.log_buyer_events(jsonb) from public, anon;
grant execute on function public.log_buyer_events(jsonb) to authenticated;
