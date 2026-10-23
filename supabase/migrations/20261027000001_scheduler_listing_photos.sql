-- The nightly refresh publishes as the service role. apply_source_item learned
-- to treat a missing auth.uid() as that job. This function did not: it raised
-- 'Sign in first.' after the photographs had already been copied into the
-- bucket. The listing went live, listing_photos stayed empty, and the card
-- says "No photograph". A signed-in dealer was never affected, which is why
-- older galleries are fine.
--
-- A null uid is allowed only for the service role (or a session with no JWT,
-- which is a migration). Everyone else still has to control the shop.

create or replace function public.replace_listing_photos(p_listing_id uuid, p_photos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  request_role text :=
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  written integer;
begin
  if actor is null then
    if request_role is not null and request_role <> 'service_role' then
      raise exception 'Sign in first.' using errcode = '42501';
    end if;

    if not exists (select 1 from public.listings where id = p_listing_id) then
      raise exception 'No such listing.';
    end if;
  elsif not exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and public.controls_dealer(l.dealer_id)
  ) then
    raise exception 'You do not manage that listing.' using errcode = '42501';
  end if;

  delete from public.listing_photos where listing_id = p_listing_id;

  -- listing_id comes from the argument, never from the payload, so a caller
  -- cannot write a gallery onto someone else's listing through this array.
  insert into public.listing_photos (listing_id, source_url, storage_path, position)
  select
    p_listing_id,
    photo ->> 'source_url',
    photo ->> 'storage_path',
    (photo ->> 'position')::integer
  from jsonb_array_elements(p_photos) as photo;

  get diagnostics written = row_count;
  return written;
end;
$$;

-- A watch whose listing was applied and then lost the photo write is not
-- "done". The text hashes agree, so the queue used to walk past it and the
-- empty card stayed empty. Same rule in the count, or the nightly script
-- stops while those watches are still bare.

create or replace function public.pending_source_items(
  p_dealer_id uuid,
  p_limit integer default 10
)
returns setof public.source_items
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish
    and s.available
    and (
      s.extracted_hash is distinct from s.text_hash
      or s.applied_hash is distinct from s.content_hash
      or (
        s.listing_id is not null
        and not exists (
          select 1 from public.listing_photos p where p.listing_id = s.listing_id
        )
      )
    )
    and s.error is null
  order by s.first_seen_at
  limit least(greatest(p_limit, 1), 25);
$$;

create or replace function public.pending_source_item_count(p_dealer_id uuid)
returns table (pending integer, failed integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (
      where s.available
        and s.error is null
        and (
          s.extracted_hash is distinct from s.text_hash
          or s.applied_hash is distinct from s.content_hash
          or (
            s.listing_id is not null
            and not exists (
              select 1 from public.listing_photos p where p.listing_id = s.listing_id
            )
          )
        )
    )::integer,
    count(*) filter (where s.available and s.error is not null)::integer
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish;
$$;

-- The copies are already in the bucket, under `{listing_id}/{position}.ext`.
-- Point the cards at them. A listing that already has a row is left alone.
-- Where the file count matches the gallery the publisher would have hashed
-- (the first six photo URLs, joined by a NUL byte — photosFingerprint in
-- import-listings/hash.ts), stamp that hash so the next refresh does not
-- download the same files again. Text cannot hold a NUL, so the bytes are
-- built in hex. A short gallery is left unstamped, and the queue above
-- copies the rest.

with named as (
  select
    split_part(o.name, '/', 1) as listing_text,
    split_part(split_part(o.name, '/', 2), '.', 1) as position_text,
    o.name as storage_path,
    o.created_at
  from storage.objects o
  where o.bucket_id = 'listing-photos'
    and o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+\.[a-z0-9]+$'
),
files as (
  select distinct on (listing_text, position_text)
    listing_text::uuid as listing_id,
    position_text::integer as position,
    storage_path
  from named
  order by listing_text, position_text, created_at desc
),
bare as (
  select l.id as listing_id, l.source_url
  from public.listings l
  where not exists (
    select 1 from public.listing_photos p where p.listing_id = l.id
  )
),
inserted as (
  insert into public.listing_photos (listing_id, source_url, storage_path, position)
  select
    f.listing_id,
    coalesce(
      (
        select t.url
        from public.source_items s
        cross join lateral jsonb_array_elements_text(s.raw -> 'photoUrls')
          with ordinality as t(url, ord)
        where s.listing_id = f.listing_id
          and jsonb_typeof(s.raw -> 'photoUrls') = 'array'
          and t.ord = f.position + 1
          and t.url <> ''
        order by s.first_seen_at
        limit 1
      ),
      b.source_url,
      'https://graham.watch'
    ),
    f.storage_path,
    f.position
  from files f
  join bare b on b.listing_id = f.listing_id
  returning listing_id
),
-- Count from RETURNING. A later statement in this same query cannot see the
-- insert in listing_photos; data-modifying CTEs share one snapshot.
inserted_counts as (
  select listing_id, count(*)::integer as n
  from inserted
  group by listing_id
),
stamped as (
  update public.source_items s
  set
    photos_hash = case
      when finger.payload is not null
        and finger.expected > 0
        and counts.n = finger.expected
      then encode(extensions.digest(finger.payload, 'sha256'), 'hex')
      else s.photos_hash
    end,
    error = case when s.error = 'Sign in first.' then null else s.error end
  from inserted_counts counts
  join (
    select
      s2.id,
      s2.listing_id,
      case
        when jsonb_typeof(s2.raw -> 'photoUrls') = 'array' then (
          select decode(
            string_agg(encode(convert_to(t.url, 'UTF8'), 'hex'), '00' order by t.ord),
            'hex'
          )
          from jsonb_array_elements_text(s2.raw -> 'photoUrls') with ordinality as t(url, ord)
          where t.ord <= 6
        )
      end as payload,
      case
        when jsonb_typeof(s2.raw -> 'photoUrls') = 'array' then (
          select count(*)
          from jsonb_array_elements_text(s2.raw -> 'photoUrls') with ordinality as t(url, ord)
          where t.ord <= 6
        )
        else 0
      end as expected
    from public.source_items s2
  ) finger on finger.listing_id = counts.listing_id
  where s.id = finger.id
  returning s.id
)
select count(*) from stamped;
