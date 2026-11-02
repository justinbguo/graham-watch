-- One definition of "this listing matches this Buy filter".
--
-- Search and the count used to each keep a copy of the cuts (see
-- search_listings and listing_counts). They could drift: a watch in the
-- result list and a different number beside it. Both v2 functions call
-- listing_matches and nothing else decides the filter. v1 is left in place;
-- the app still calls it.
--
-- The jsonb argument is a FilterSpec, the same shape canonicalize() stores:
-- omitted or empty means no cut on that dimension, price is a list of
-- inclusive bands in cents (a watch matches if it sits in any band), and
-- size and era are preset ids from src/features/filters/types.ts. The
-- numbers below are those presets. A preset id this list does not know is
-- ignored, and if none of the ids are known the dimension is not a cut —
-- the same as the client dropping an id it cannot resolve.
--
-- Text is the v1 rule, not a new one: an english full-text match on
-- brand + model + reference, or a case-insensitive substring of any one of
-- those fields. A blank or whitespace-only query is no query.
--
-- Paging is keyset, not OFFSET. OFFSET skips or repeats a row when a watch
-- is inserted ahead of the page you are on. The cursor is the sort key of
-- the last row returned; the next call asks for keys strictly after it.
-- The order is total: favorite rank when that flag is on, then the chosen
-- price or year with nulls last, then created_at descending, then id
-- descending. id is the tie-break v1 did not have, so two watches with the
-- same timestamp cannot trade places between pages.
--
-- The cursor itself is opaque base64: version byte, sort code, favorites
-- flag, then that 34-byte key. A cursor built for a different sort or a
-- different favorites flag is rejected rather than applied to the wrong
-- order. Helpers that build the key live in listing_filter so PostgREST
-- does not publish them; search still runs as the caller, which is why
-- those roles are granted execute.

create schema if not exists listing_filter;

revoke all on schema listing_filter from public;
grant usage on schema listing_filter to anon, authenticated, service_role;

create function listing_filter.invert_bytes(p_bytes bytea)
returns bytea
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select decode(
    string_agg(lpad(to_hex(255 - get_byte(p_bytes, g.i)), 2, '0'), '' order by g.i),
    'hex'
  )
  from generate_series(0, octet_length(p_bytes) - 1) as g(i);
$$;

-- Flip the sign bit so byte order matches signed numeric order, then invert
-- the bytes when the sort direction is descending. Nulls are a separate flag
-- byte so they sort last in either direction.
create function listing_filter.sort_key(
  p_listing public.listings,
  p_fav_rank integer,
  p_sort text
)
returns bytea
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  payload bytea;
  flag integer;
  micros bigint;
  result bytea;
begin
  if p_sort not in ('newest', 'price_asc', 'price_desc', 'oldest', 'newest_watch') then
    raise exception 'unknown listing sort' using errcode = '22023';
  end if;
  if p_fav_rank is null or p_fav_rank < 0 or p_fav_rank > 255 then
    raise exception 'bad favorite rank' using errcode = '22023';
  end if;

  if p_sort = 'newest' then
    flag := 0;
    payload := int8send(0);
  elsif p_sort in ('price_asc', 'price_desc') then
    if p_listing.price_cents is null then
      flag := 1;
      payload := int8send(0);
    else
      flag := 0;
      payload := set_byte(
        int8send(p_listing.price_cents),
        0,
        get_byte(int8send(p_listing.price_cents), 0) # 128
      );
      if p_sort = 'price_desc' then
        payload := listing_filter.invert_bytes(payload);
      end if;
    end if;
  elsif p_listing.year is null then
    flag := 1;
    payload := int8send(0);
  else
    flag := 0;
    payload := set_byte(
      int8send(p_listing.year::bigint),
      0,
      get_byte(int8send(p_listing.year::bigint), 0) # 128
    );
    if p_sort = 'newest_watch' then
      payload := listing_filter.invert_bytes(payload);
    end if;
  end if;

  -- Whole seconds from epoch, plus the leftover microseconds. Both halves
  -- are integers, so two timestamps a microsecond apart cannot collapse.
  micros :=
    extract(epoch from date_trunc('second', p_listing.created_at))::bigint * 1000000
    + (
      extract(microseconds from p_listing.created_at)
      - floor(extract(seconds from p_listing.created_at)) * 1000000
    )::bigint;

  result :=
    set_byte('\x00'::bytea, 0, p_fav_rank)
    || set_byte('\x00'::bytea, 0, flag)
    || payload
    || listing_filter.invert_bytes(
      set_byte(int8send(micros), 0, get_byte(int8send(micros), 0) # 128)
    )
    || listing_filter.invert_bytes(uuid_send(p_listing.id));

  if octet_length(result) <> 34 then
    raise exception 'listing sort key was not 34 bytes' using errcode = 'XX000';
  end if;
  return result;
end;
$$;

create function listing_filter.pack_cursor(
  p_key bytea,
  p_sort text,
  p_favorites_first boolean
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  code integer := case p_sort
    when 'newest' then 1
    when 'price_asc' then 2
    when 'price_desc' then 3
    when 'oldest' then 4
    when 'newest_watch' then 5
    else null
  end;
begin
  if code is null or p_key is null or octet_length(p_key) <> 34 then
    raise exception 'bad listing cursor' using errcode = '22023';
  end if;
  return encode(
    set_byte('\x00'::bytea, 0, 1)
      || set_byte('\x00'::bytea, 0, code)
      || set_byte('\x00'::bytea, 0, case when coalesce(p_favorites_first, false) then 1 else 0 end)
      || p_key,
    'base64'
  );
end;
$$;

create function listing_filter.unpack_cursor(
  p_cursor text,
  p_sort text,
  p_favorites_first boolean
)
returns bytea
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  raw bytea;
  code integer := case p_sort
    when 'newest' then 1
    when 'price_asc' then 2
    when 'price_desc' then 3
    when 'oldest' then 4
    when 'newest_watch' then 5
    else null
  end;
  fav integer := case when coalesce(p_favorites_first, false) then 1 else 0 end;
begin
  if code is null then
    raise exception 'unknown listing sort' using errcode = '22023';
  end if;
  if p_cursor is null then
    return null;
  end if;
  begin
    raw := decode(p_cursor, 'base64');
  exception
    when others then
      raise exception 'bad listing cursor' using errcode = '22023';
  end;
  if raw is null
    or octet_length(raw) <> 37
    or get_byte(raw, 0) <> 1
    or get_byte(raw, 1) <> code
    or get_byte(raw, 2) <> fav
  then
    raise exception 'listing cursor does not match this search' using errcode = '22023';
  end if;
  return substring(raw from 4 for 34);
end;
$$;

revoke all on function listing_filter.invert_bytes(bytea) from public;
revoke all on function listing_filter.sort_key(public.listings, integer, text) from public;
revoke all on function listing_filter.pack_cursor(bytea, text, boolean) from public;
revoke all on function listing_filter.unpack_cursor(text, text, boolean) from public;
grant execute on function listing_filter.invert_bytes(bytea) to anon, authenticated, service_role;
grant execute on function listing_filter.sort_key(public.listings, integer, text) to anon, authenticated, service_role;
grant execute on function listing_filter.pack_cursor(bytea, text, boolean) to anon, authenticated, service_role;
grant execute on function listing_filter.unpack_cursor(text, text, boolean) to anon, authenticated, service_role;

create function public.listing_matches(p_listing public.listings, p_spec jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  spec jsonb := p_spec;
  query text;
  band jsonb;
  price_hit boolean;
  known boolean;
  preset_hit boolean;
begin
  if spec is null then
    return true;
  end if;
  if jsonb_typeof(spec) <> 'object' then
    raise exception 'filter spec must be an object' using errcode = '22023';
  end if;

  if spec ? 'brands' and spec -> 'brands' is not null and jsonb_typeof(spec -> 'brands') <> 'null' then
    if jsonb_typeof(spec -> 'brands') <> 'array' then
      raise exception 'filter brands must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'brands') > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(spec -> 'brands') as wanted(value)
        where p_listing.brand_key = wanted.value
      )
    then
      return false;
    end if;
  end if;

  if spec ? 'dealers' and spec -> 'dealers' is not null and jsonb_typeof(spec -> 'dealers') <> 'null' then
    if jsonb_typeof(spec -> 'dealers') <> 'array' then
      raise exception 'filter dealers must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'dealers') > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(spec -> 'dealers') as wanted(value)
        where lower(wanted.value) = lower(p_listing.dealer_id::text)
      )
    then
      return false;
    end if;
  end if;

  if spec ? 'styles' and spec -> 'styles' is not null and jsonb_typeof(spec -> 'styles') <> 'null' then
    if jsonb_typeof(spec -> 'styles') <> 'array' then
      raise exception 'filter styles must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'styles') > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(spec -> 'styles') as wanted(value)
        where p_listing.style = wanted.value::public.watch_style
      )
    then
      return false;
    end if;
  end if;

  if spec ? 'materials' and spec -> 'materials' is not null and jsonb_typeof(spec -> 'materials') <> 'null' then
    if jsonb_typeof(spec -> 'materials') <> 'array' then
      raise exception 'filter materials must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'materials') > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(spec -> 'materials') as wanted(value)
        where p_listing.case_material = wanted.value::public.case_material
      )
    then
      return false;
    end if;
  end if;

  if spec ? 'windings' and spec -> 'windings' is not null and jsonb_typeof(spec -> 'windings') <> 'null' then
    if jsonb_typeof(spec -> 'windings') <> 'array' then
      raise exception 'filter windings must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'windings') > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(spec -> 'windings') as wanted(value)
        where p_listing.winding = wanted.value::public.winding
      )
    then
      return false;
    end if;
  end if;

  -- Every complication asked for has to be on the watch, not just one of them.
  if spec ? 'complications' and spec -> 'complications' is not null and jsonb_typeof(spec -> 'complications') <> 'null' then
    if jsonb_typeof(spec -> 'complications') <> 'array' then
      raise exception 'filter complications must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'complications') > 0
      and not (
        p_listing.complications @> (
          select array_agg(wanted.value::public.complication)
          from jsonb_array_elements_text(spec -> 'complications') as wanted(value)
        )
      )
    then
      return false;
    end if;
  end if;

  if spec ? 'prices' and spec -> 'prices' is not null and jsonb_typeof(spec -> 'prices') <> 'null' then
    if jsonb_typeof(spec -> 'prices') <> 'array' then
      raise exception 'filter prices must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'prices') > 0 then
      -- A missing price cannot sit inside a band.
      if p_listing.price_cents is null then
        return false;
      end if;
      price_hit := false;
      for band in
        select prices.value
        from jsonb_array_elements(spec -> 'prices') as prices(value)
      loop
        if jsonb_typeof(band) <> 'object' then
          raise exception 'filter price band must be an object' using errcode = '22023';
        end if;
        if band ? 'min' and jsonb_typeof(band -> 'min') not in ('number', 'null') then
          raise exception 'filter price min must be a number' using errcode = '22023';
        end if;
        if band ? 'max' and jsonb_typeof(band -> 'max') not in ('number', 'null') then
          raise exception 'filter price max must be a number' using errcode = '22023';
        end if;
        if (band ->> 'min' is null or p_listing.price_cents >= (band ->> 'min')::numeric)
          and (band ->> 'max' is null or p_listing.price_cents <= (band ->> 'max')::numeric)
        then
          price_hit := true;
        end if;
      end loop;
      if not price_hit then
        return false;
      end if;
    end if;
  end if;

  -- Size presets: under 34, 34–36, 36–39, 39+. Ends are inclusive, so 34mm is
  -- both "under 34" and "34–36". Same numbers as SIZE_PRESETS.
  if spec ? 'sizes' and spec -> 'sizes' is not null and jsonb_typeof(spec -> 'sizes') <> 'null' then
    if jsonb_typeof(spec -> 'sizes') <> 'array' then
      raise exception 'filter sizes must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'sizes') > 0 then
      select exists (
        select 1
        from jsonb_array_elements_text(spec -> 'sizes') as wanted(id)
        where wanted.id in ('small', 'mid', 'large', 'xlarge')
      ) into known;
      if known then
        select exists (
          select 1
          from jsonb_array_elements_text(spec -> 'sizes') as wanted(id)
          join (
            values
              ('small'::text, null::numeric, 34::numeric),
              ('mid', 34, 36),
              ('large', 36, 39),
              ('xlarge', 39, null)
          ) as preset(id, lo, hi) on preset.id = wanted.id
          where p_listing.case_size_mm is not null
            and (preset.lo is null or p_listing.case_size_mm >= preset.lo)
            and (preset.hi is null or p_listing.case_size_mm <= preset.hi)
        ) into preset_hit;
        if not preset_hit then
          return false;
        end if;
      end if;
    end if;
  end if;

  -- Era presets: pre-1950, each decade through the 1970s, then 1980+. Same
  -- numbers as ERA_PRESETS. 1949 is pre-1950; 1950 is the 1950s.
  if spec ? 'eras' and spec -> 'eras' is not null and jsonb_typeof(spec -> 'eras') <> 'null' then
    if jsonb_typeof(spec -> 'eras') <> 'array' then
      raise exception 'filter eras must be a list' using errcode = '22023';
    end if;
    if jsonb_array_length(spec -> 'eras') > 0 then
      select exists (
        select 1
        from jsonb_array_elements_text(spec -> 'eras') as wanted(id)
        where wanted.id in ('prewar', 'fifties', 'sixties', 'seventies', 'modern')
      ) into known;
      if known then
        select exists (
          select 1
          from jsonb_array_elements_text(spec -> 'eras') as wanted(id)
          join (
            values
              ('prewar'::text, null::numeric, 1949::numeric),
              ('fifties', 1950, 1959),
              ('sixties', 1960, 1969),
              ('seventies', 1970, 1979),
              ('modern', 1980, null)
          ) as preset(id, lo, hi) on preset.id = wanted.id
          where p_listing.year is not null
            and (preset.lo is null or p_listing.year >= preset.lo)
            and (preset.hi is null or p_listing.year <= preset.hi)
        ) into preset_hit;
        if not preset_hit then
          return false;
        end if;
      end if;
    end if;
  end if;

  if spec ? 'query' and jsonb_typeof(spec -> 'query') not in ('string', 'null') then
    raise exception 'filter query must be text' using errcode = '22023';
  end if;
  query := nullif(btrim(coalesce(spec ->> 'query', '')), '');
  -- A null brand, model, or reference makes that ilike null. In a WHERE
  -- clause null is a miss. In this IF it would fall through and the watch
  -- would match, so an absent reference has to count as "no".
  if query is not null
    and not coalesce(
      (
        to_tsvector(
          'english',
          coalesce(p_listing.brand, '') || ' ' || coalesce(p_listing.model, '') || ' ' || coalesce(p_listing.reference, '')
        ) @@ websearch_to_tsquery('english', query)
        or p_listing.brand ilike '%' || query || '%'
        or p_listing.model ilike '%' || query || '%'
        or p_listing.reference ilike '%' || query || '%'
      ),
      false
    )
  then
    return false;
  end if;

  return true;
end;
$$;

create function public.search_listings_v2(
  p_spec jsonb default '{}'::jsonb,
  p_limit integer default 20,
  p_cursor text default null,
  p_exclude_swiped boolean default false,
  p_exclude_own boolean default true,
  p_sort text default 'newest',
  p_favorites_first boolean default false
)
returns table (listing public.listings, cursor text)
language sql
stable
security invoker
set search_path = ''
as $$
  with args as (
    select
      coalesce(p_spec, '{}'::jsonb) as spec,
      least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
      coalesce(p_sort, 'newest') as sort,
      coalesce(p_favorites_first, false) as favorites_first,
      coalesce(p_exclude_swiped, false) as exclude_swiped,
      coalesce(p_exclude_own, true) as exclude_own,
      listing_filter.unpack_cursor(
        p_cursor,
        coalesce(p_sort, 'newest'),
        coalesce(p_favorites_first, false)
      ) as after_key,
      coalesce(
        (
          select p.favorite_brands
          from public.profiles p
          where p.id = (select auth.uid())
        ),
        '{}'::text[]
      ) as favorite_brands
  ),
  matched as (
    select
      l,
      case
        when args.favorites_first and l.brand_key = any (args.favorite_brands) then 0
        else 1
      end as fav_rank
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    cross join args
    where l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
      and public.discovery_visible_to_caller(args.exclude_own, l.imported_by, d.claimed_by)
      and (
        not args.exclude_swiped
        or not exists (
          select 1
          from public.swipes s
          where s.listing_id = l.id
            and s.actor_id = (select auth.uid())
        )
      )
      and public.listing_matches(l, args.spec)
  ),
  keyed as (
    select
      matched.l,
      listing_filter.sort_key(matched.l, matched.fav_rank, args.sort) as sort_key
    from matched
    cross join args
    where args.after_key is null
      or listing_filter.sort_key(matched.l, matched.fav_rank, args.sort) > args.after_key
  ),
  ordered as materialized (
    select keyed.l, keyed.sort_key
    from keyed
    order by keyed.sort_key
    limit (select lim + 1 from args)
  )
  select
    ordered.l,
    case
      when (select count(*) from ordered) > (select lim from args) then listing_filter.pack_cursor(
        (
          select o.sort_key
          from ordered o
          order by o.sort_key
          offset ((select lim from args) - 1)
          limit 1
        ),
        (select sort from args),
        (select favorites_first from args)
      )
      else null
    end
  from ordered
  order by ordered.sort_key
  limit (select lim from args);
$$;

create function public.listing_counts_v2(
  p_spec jsonb default '{}'::jsonb,
  p_exclude_swiped boolean default false,
  p_exclude_own boolean default true
)
returns table (matched bigint, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with args as (
    select
      coalesce(p_spec, '{}'::jsonb) as spec,
      coalesce(p_exclude_swiped, false) as exclude_swiped,
      coalesce(p_exclude_own, true) as exclude_own
  ),
  visible as (
    select l as listing
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    cross join args
    where l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
      and public.discovery_visible_to_caller(args.exclude_own, l.imported_by, d.claimed_by)
  )
  select
    (
      select count(*)
      from visible v
      cross join args
      where (
          not args.exclude_swiped
          or not exists (
            select 1
            from public.swipes s
            where s.listing_id = (v.listing).id
              and s.actor_id = (select auth.uid())
          )
        )
        and public.listing_matches(v.listing, args.spec)
    ) as matched,
    (select count(*) from visible) as total;
$$;

revoke all on function public.listing_matches(public.listings, jsonb) from public;
revoke all on function public.search_listings_v2(jsonb, integer, text, boolean, boolean, text, boolean) from public;
revoke all on function public.listing_counts_v2(jsonb, boolean, boolean) from public;

grant execute on function public.listing_matches(public.listings, jsonb) to anon, authenticated, service_role;
grant execute on function public.search_listings_v2(jsonb, integer, text, boolean, boolean, text, boolean) to anon, authenticated, service_role;
grant execute on function public.listing_counts_v2(jsonb, boolean, boolean) to anon, authenticated, service_role;
