/*
Revert:
  revoke execute on function public.log_guest_events(uuid, jsonb, text) from anon;
  drop function public.operator_claim_guest(uuid);
  drop function public.operator_guest(uuid, integer);
  drop function public.operator_guests();
  drop function public.guest_summary(uuid);
  drop function public.purge_unclaimed_guest_events();
  drop function public.claim_guest_events(uuid);
  drop function public.log_guest_events(uuid, jsonb, text);
  drop table public.guest_devices;
  drop index public.buyer_events_guest_received_idx;
  delete from public.buyer_events where user_id is null;
  alter table public.buyer_events alter column user_id set not null;
  alter table public.buyer_events drop constraint buyer_events_actor;
*/

-- A signed-out browser is a guest until someone signs in on it. The row stays
-- in buyer_events. user_id is null until claim_guest_events fills it. guest_key
-- is required then, so a row still names a device.

alter table public.buyer_events alter column user_id drop not null;

alter table public.buyer_events
  add constraint buyer_events_actor check (user_id is not null or guest_key is not null);

-- The per-device cap counts unclaimed rows for one key. Claimed rows leave
-- this index because their user_id is set.
create index buyer_events_guest_received_idx
  on public.buyer_events (guest_key, received_at)
  where user_id is null;

comment on table public.buyer_events is
  'Append-only buyer behavior. Written by log_buyer_events and log_guest_events. A null user_id is an unclaimed guest, and then guest_key is required. Read by service_role, and by operators through operator_accounts, operator_account, operator_guests, and operator_guest. Account deletion cascades claimed rows. Listing and shop deletion does not. purge_unclaimed_guest_events deletes unclaimed rows older than 180 days.';

comment on column public.buyer_events.user_id is
  'The account that owns the row. Null while the guest has not signed in. log_buyer_events and claim_guest_events set it. Deleting the account cascades these rows.';

comment on column public.buyer_events.guest_key is
  'The stable device key, not a per-buffer key. The same browser keeps one key across visits, including after sign-in and sign-out. Null user_id means the row is still unclaimed.';

create table public.guest_devices (
  guest_key uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  country text,
  device text,
  claimed_by uuid references auth.users (id) on delete set null,
  constraint guest_devices_country check (country is null or country ~ '^[A-Z]{2}$'),
  constraint guest_devices_device check (
    device is null or device in ('web-desktop', 'web-mobile', 'ios', 'android')
  )
);

alter table public.guest_devices enable row level security;

revoke all on public.guest_devices from public, anon, authenticated, service_role;
grant select on public.guest_devices to service_role;

comment on table public.guest_devices is
  'One row per signed-out device. log_guest_events upserts it. RLS is on and there are no policies. service_role may select. Clients cannot read or write the table.';

/**
 * One guest, as the Guests list shows them. operator_guests and operator_guest
 * are the only callers. Client roles cannot execute this.
 *
 * Sessions are 1 plus each gap over 30 minutes between successive occurred_at
 * values. Claimed and unclaimed rows both count. A key with no events has 0.
 */
create function public.guest_summary(p_guest_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return (
    select jsonb_build_object(
      'guest_key', device.guest_key,
      'first_seen_at', device.first_seen_at,
      'last_seen_at', device.last_seen_at,
      'sessions', (
        select case
          when count(*) = 0 then 0
          else 1 + count(*) filter (where stepped.gap > interval '30 minutes')
        end::integer
        from (
          select events.occurred_at
            - lag(events.occurred_at) over (order by events.occurred_at, events.id) as gap
          from public.buyer_events events
          where events.guest_key = device.guest_key
        ) stepped
      ),
      'listings_viewed', (
        select count(distinct events.listing_id)::integer
        from public.buyer_events events
        where events.guest_key = device.guest_key
          and events.kind in ('impression', 'dwell')
          and events.listing_id is not null
      ),
      'passes', (
        select count(*)::integer
        from public.buyer_events events
        where events.guest_key = device.guest_key
          and events.kind = 'pass'
      ),
      'dealer_clicks', (
        select count(*)::integer
        from public.buyer_events events
        where events.guest_key = device.guest_key
          and events.kind = 'dealer_click'
      ),
      'inquiry_opens', (
        select count(*)::integer
        from public.buyer_events events
        where events.guest_key = device.guest_key
          and events.kind = 'inquiry_open'
      ),
      'dealers', coalesce((
        select jsonb_agg(jsonb_build_object('name', picked.name, 'count', picked.n) order by picked.n desc, picked.name)
        from (
          select dealers.name, count(*)::integer as n
          from public.buyer_events events
          join public.listings listings on listings.id = events.listing_id
          join public.dealers dealers on dealers.id = listings.dealer_id
          where events.guest_key = device.guest_key
            and events.kind in ('impression', 'dwell', 'pass', 'dealer_click')
          group by dealers.id, dealers.name
          order by n desc, dealers.name
          limit 3
        ) picked
      ), '[]'::jsonb),
      'brands', coalesce((
        select jsonb_agg(jsonb_build_object('name', picked.name, 'count', picked.n) order by picked.n desc, picked.name)
        from (
          select listings.brand as name, count(*)::integer as n
          from public.buyer_events events
          join public.listings listings on listings.id = events.listing_id
          where events.guest_key = device.guest_key
            and listings.brand is not null
            and btrim(listings.brand) <> ''
          group by listings.brand
          order by n desc, listings.brand
          limit 3
        ) picked
      ), '[]'::jsonb),
      'country', device.country,
      'device', device.device,
      'claimed_by', device.claimed_by,
      'claimed_name', nullif(btrim(person.first_name), ''),
      'operator', exists (
        select 1 from public.operators operators
        where operators.user_id = device.claimed_by
      )
    )
    from public.guest_devices device
    left join public.profiles person on person.id = device.claimed_by
    where device.guest_key = p_guest_key
  );
end;
$$;

revoke all on function public.guest_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function public.guest_summary(uuid) to current_user;

comment on function public.guest_summary(uuid) is
  'One guest row for the operator Guests screen. Not granted to client roles. Operators only, through operator_guests and operator_guest.';

/**
 * Signed-out writes. anon can call it. A signed-in caller is refused so those
 * rows stay on log_buyer_events.
 *
 * Default privileges no longer grant execute to anon, so the grant below is
 * the one that lets a signed-out browser write. The body still refuses a JWT.
 *
 * user_id, guest_key, and received_at are overwritten here. A client value for
 * any of the three is ignored. A cap returns 0 and inserts nothing. The app
 * treats that the same as a replay and drops the ids. A bad batch raises and
 * stores nothing.
 *
 * Country is the cf-ipcountry header when it is two letters. XX and T1 are
 * dropped. No IP, user agent, city, or referrer is stored.
 */
create function public.log_guest_events(p_guest_key uuid, p_events jsonb, p_device text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  recent_count integer := 0;
  hour_count integer := 0;
  header_text text;
  headers jsonb := null;
  country_code text := null;
begin
  if (select auth.uid()) is not null then
    raise exception 'signed-in events use log_buyer_events' using errcode = '28000';
  end if;

  if p_guest_key is null then
    raise exception 'guest_key is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'events must be an array of at most 50' using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) > 50 or octet_length(p_events::text) > 65536 then
    raise exception 'events must be an array of at most 50 and at most 64KB' using errcode = '22023';
  end if;

  if p_device is not null and p_device not in ('web-desktop', 'web-mobile', 'ios', 'android') then
    raise exception 'unknown device' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_events) as item
    where coalesce(item ->> 'kind', '') not in (
      'impression', 'dwell', 'pass', 'undo', 'dealer_click', 'inquiry_open', 'filter'
    )
  ) then
    raise exception 'that kind is not logged for a guest' using errcode = '22023';
  end if;

  -- A missing listing is 23503. A listing id that is not a uuid fails the cast
  -- with a class 22 error. There is no foreign key: a deleted watch keeps history.
  if exists (
    select 1
    from jsonb_array_elements(p_events) as item
    where item ->> 'listing_id' is not null
      and not exists (
        select 1
        from public.listings listings
        where listings.id = (item ->> 'listing_id')::uuid
      )
  ) then
    raise exception 'listing does not exist' using errcode = '23503';
  end if;

  select count(*)::integer into recent_count
  from public.buyer_events events
  where events.user_id is null
    and events.guest_key = p_guest_key
    and events.received_at > now() - interval '24 hours';

  if recent_count >= 2000 or recent_count + jsonb_array_length(p_events) > 2000 then
    return 0;
  end if;

  select count(*)::integer into hour_count
  from public.buyer_events events
  where events.user_id is null
    and events.received_at > now() - interval '1 hour';

  if hour_count >= 20000 or hour_count + jsonb_array_length(p_events) > 20000 then
    return 0;
  end if;

  insert into public.buyer_events
  select record.*
  from jsonb_array_elements(p_events) as item,
       lateral jsonb_populate_record(
         null::public.buyer_events,
         (item - 'user_id' - 'guest_key' - 'received_at')
           || jsonb_build_object('guest_key', p_guest_key, 'received_at', now())
       ) as record
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  header_text := current_setting('request.headers', true);
  if header_text is not null and btrim(header_text) <> '' then
    begin
      headers := header_text::jsonb;
    exception
      when others then
        headers := null;
    end;
  end if;

  if jsonb_typeof(headers) = 'object' then
    country_code := upper(headers ->> 'cf-ipcountry');
  end if;
  if country_code is null or country_code !~ '^[A-Z]{2}$' or country_code in ('XX', 'T1') then
    country_code := null;
  end if;

  insert into public.guest_devices as known (guest_key, first_seen_at, last_seen_at, device, country)
  values (p_guest_key, now(), now(), p_device, country_code)
  on conflict (guest_key) do update
  set last_seen_at = now(),
      device = coalesce(excluded.device, known.device),
      country = coalesce(excluded.country, known.country);

  return inserted_count;
end;
$$;

revoke all on function public.log_guest_events(uuid, jsonb, text) from public;
grant execute on function public.log_guest_events(uuid, jsonb, text) to anon, authenticated;

comment on function public.log_guest_events(uuid, jsonb, text) is
  'Stores a signed-out batch under one device key. A signed-in caller is refused. Over the cap it returns 0 and writes nothing.';

/**
 * Sign-in takes the device's unclaimed rows. A second call changes nothing.
 * claimed_by stays with the first account that took the device.
 */
create function public.claim_guest_events(p_guest_key uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  updated_count integer := 0;
begin
  if uid is null then
    raise exception 'sign in to claim guest events' using errcode = '28000';
  end if;

  if p_guest_key is null then
    raise exception 'guest_key is required' using errcode = '22023';
  end if;

  update public.buyer_events
  set user_id = uid
  where guest_key = p_guest_key
    and user_id is null;

  get diagnostics updated_count = row_count;

  update public.guest_devices
  set claimed_by = uid
  where guest_key = p_guest_key
    and claimed_by is null;

  return updated_count;
end;
$$;

revoke all on function public.claim_guest_events(uuid) from public, anon;
grant execute on function public.claim_guest_events(uuid) to authenticated;

comment on function public.claim_guest_events(uuid) is
  'Gives the signed-in account the unclaimed rows for one device key. Idempotent. Does not take a device another account already claimed.';

/**
 * Nightly full refresh calls this. Nothing in this repo schedules pg_cron.
 * Returns how many event rows were deleted. A fresh row stays.
 */
create function public.purge_unclaimed_guest_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer := 0;
begin
  delete from public.buyer_events
  where user_id is null
    and received_at < now() - interval '180 days';

  get diagnostics removed = row_count;

  delete from public.guest_devices device
  where device.claimed_by is null
    and device.last_seen_at < now() - interval '180 days'
    and not exists (
      select 1
      from public.buyer_events events
      where events.guest_key = device.guest_key
    );

  return removed;
end;
$$;

revoke all on function public.purge_unclaimed_guest_events() from public, anon, authenticated;
grant execute on function public.purge_unclaimed_guest_events() to service_role;

comment on function public.purge_unclaimed_guest_events() is
  'Deletes unclaimed guest rows and devices older than 180 days. service_role only. The nightly full refresh calls it.';

create function public.operator_guests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return coalesce((
    select jsonb_agg(public.guest_summary(device.guest_key) order by device.last_seen_at desc)
    from public.guest_devices device
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.operator_guests() from public, anon;
grant execute on function public.operator_guests() to authenticated, service_role;

comment on function public.operator_guests() is
  'Every guest device, newest last_seen_at first, for the operator Guests screen. Operators only.';

create function public.operator_guest(p_guest_key uuid, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 2000);
  summary jsonb;
  sessions jsonb;
begin
  perform public.require_operator();

  summary := public.guest_summary(p_guest_key);
  if summary is null then
    raise exception 'No such guest.' using errcode = 'P0002';
  end if;

  with capped as (
    select events.*
    from public.buyer_events events
    where events.guest_key = p_guest_key
    order by events.occurred_at desc, events.id desc
    limit lim
  ),
  ordered as (
    select
      capped.*,
      lag(capped.occurred_at) over (order by capped.occurred_at, capped.id) as prev_at
    from capped
  ),
  marked as (
    select
      ordered.*,
      sum(
        case
          when ordered.prev_at is null or ordered.occurred_at - ordered.prev_at > interval '30 minutes' then 1
          else 0
        end
      ) over (order by ordered.occurred_at, ordered.id) as session_no
    from ordered
  ),
  enriched as (
    select
      marked.id,
      marked.occurred_at,
      marked.kind,
      marked.surface,
      marked.dwell_ms,
      marked.photo_index,
      marked.filter,
      marked.listing_id,
      marked.session_no,
      listings.brand,
      listings.model,
      listings.price_cents,
      listings.currency,
      dealers.name as dealer_name,
      photo.storage_path as thumb_path,
      photo.source_url as thumb_source_url
    from marked
    left join public.listings listings on listings.id = marked.listing_id
    left join public.dealers dealers on dealers.id = marked.dealer_id
    left join lateral (
      select photos.storage_path, photos.source_url
      from public.listing_photos photos
      where photos.listing_id = marked.listing_id
      order by photos.position
      limit 1
    ) photo on true
  )
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'started_at', grouped.started_at,
        'events', grouped.events
      )
      order by grouped.session_no
    )
    from (
      select
        session_no,
        min(occurred_at) as started_at,
        jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'id', id,
            'at', occurred_at,
            'kind', kind,
            'surface', surface,
            'dwell_ms', dwell_ms,
            'photo_index', photo_index,
            'filter', filter,
            'listing_id', listing_id,
            'brand', brand,
            'model', model,
            'price_cents', price_cents,
            'currency', currency,
            'thumb_path', thumb_path,
            'thumb_source_url', thumb_source_url,
            'dealer_name', dealer_name
          ))
          order by occurred_at, id
        ) as events
      from enriched
      group by session_no
    ) grouped
  ), '[]'::jsonb)
  into sessions;

  return jsonb_build_object('summary', summary, 'sessions', sessions);
end;
$$;

revoke all on function public.operator_guest(uuid, integer) from public, anon;
grant execute on function public.operator_guest(uuid, integer) to authenticated, service_role;

comment on function public.operator_guest(uuid, integer) is
  'One guest''s summary and sessions for the operator Guests screen. Unknown key raises P0002. Operators only.';

/**
 * The "this is me" button. Sets claimed_by when it is null. Does not take a
 * device someone else already claimed, and does not write operator_actions.
 */
create function public.operator_claim_guest(p_guest_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  perform public.require_operator();

  if uid is null or p_guest_key is null then
    return;
  end if;

  update public.guest_devices
  set claimed_by = uid
  where guest_key = p_guest_key
    and claimed_by is null;
end;
$$;

revoke all on function public.operator_claim_guest(uuid) from public, anon;
grant execute on function public.operator_claim_guest(uuid) to authenticated, service_role;

comment on function public.operator_claim_guest(uuid) is
  'Lets the signed-in operator claim an unclaimed device as themselves. Does not overwrite a claim. Operators only.';
