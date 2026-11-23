drop function public.rank_buy_feed(jsonb, integer, text, jsonb);
drop function public.rank_unpack_cursor(text);
drop function public.rank_pack_cursor(integer, integer, timestamptz, uuid);

create function public.rank_taste_hash(p_seed jsonb)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(
    public.rank_weights(coalesce(p_seed, '{}'::jsonb))::text
    || coalesce((
      select string_agg(f.dealer_id::text, ',' order by f.dealer_id::text)
      from public.dealer_follows f
      where f.user_id = (select auth.uid())
    ), '')
  );
$$;

create function public.rank_pack_cursor(
  p_slot integer,
  p_score integer,
  p_created_at timestamptz,
  p_id uuid,
  p_taste text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(
    convert_to(
      jsonb_build_object(
        'slot', p_slot,
        'score', p_score,
        'created_at', p_created_at,
        'id', p_id,
        'taste', p_taste
      )::text,
      'utf8'
    ),
    'base64'
  );
$$;

create function public.rank_unpack_cursor(p_cursor text)
returns table (slot integer, score integer, created_at timestamptz, id uuid, taste text)
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_cursor is null then
    return;
  end if;
  return query
  select c.slot, c.score, c.created_at, c.id, c.taste
  from jsonb_to_record(convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb)
    as c(slot integer, score integer, created_at timestamptz, id uuid, taste text);
exception
  when others then
    raise exception 'bad listing cursor' using errcode = '22023';
end;
$$;

create function public.rank_open_cursor(p_cursor text, p_seed jsonb)
returns table (slot integer, score integer, created_at timestamptz, id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  opened record;
begin
  if p_cursor is null then
    return;
  end if;
  select * into opened from public.rank_unpack_cursor(p_cursor);
  if opened.taste is distinct from public.rank_taste_hash(p_seed) then
    raise exception 'listing cursor does not match this search' using errcode = '22023';
  end if;
  return query select opened.slot, opened.score, opened.created_at, opened.id;
end;
$$;

create function public.rank_buy_feed(
  p_spec jsonb default '{}'::jsonb,
  p_limit integer default 20,
  p_cursor text default null,
  p_seed jsonb default '{}'::jsonb
)
returns table (listing public.listings, cursor text)
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select
      coalesce(p_spec, '{}'::jsonb) as spec,
      least(greatest(coalesce(p_limit, 20), 1), 50) as lim
  ),
  weights as materialized (
    select
      public.rank_weights(coalesce(p_seed, '{}'::jsonb)) as w,
      public.rank_taste_hash(coalesce(p_seed, '{}'::jsonb)) as taste
  ),
  caller as materialized (
    select (select auth.uid()) as uid
  ),
  photos as materialized (
    select p.listing_id, count(*)::integer as photos
    from public.listing_photos p
    group by p.listing_id
  ),
  followed as materialized (
    select f.dealer_id
    from public.dealer_follows f
    join caller on f.user_id = caller.uid
  ),
  unpacked as (
    select * from public.rank_open_cursor(p_cursor, coalesce(p_seed, '{}'::jsonb))
  ),
  matched as materialized (
    select
      l as listing,
      coalesce(ph.photos, 0) as photos,
      (fl.dealer_id is not null) as followed
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    left join photos ph on ph.listing_id = l.id
    left join followed fl on fl.dealer_id = l.dealer_id
    cross join args
    cross join caller
    where l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
      and public.discovery_visible_to_caller(true, l.imported_by, d.claimed_by)
      and not exists (
        select 1
        from public.swipes s
        where s.listing_id = l.id
          and s.actor_id = caller.uid
      )
      and public.listing_matches(l, args.spec)
      and public.listing_for_buyer(l)
      and (
        coalesce(ph.photos, 0) >= 3
        or (
          caller.uid is not null
          and (
            l.imported_by = caller.uid
            or d.claimed_by = caller.uid
            or d.created_by = caller.uid
          )
        )
      )
  ),
  scored as materialized (
    select
      matched.listing,
      (matched.listing).id as id,
      (matched.listing).dealer_id as dealer_id,
      (matched.listing).brand_key as brand_key,
      (matched.listing).created_at as created_at,
      (
        coalesce((weights.w #>> array['brand', coalesce((matched.listing).brand_key, '')])::integer, 0)
        + case
            when (matched.listing).style is null then 0
            else coalesce((weights.w #>> array['style', (matched.listing).style::text])::integer, 0)
          end
        + case
            when (matched.listing).price_cents is null then 0
            when (matched.listing).price_cents < 500000
              then coalesce((weights.w #>> array['band', 'low'])::integer, 0)
            when (matched.listing).price_cents < 1500000
              then coalesce((weights.w #>> array['band', 'mid'])::integer, 0)
            else coalesce((weights.w #>> array['band', 'high'])::integer, 0)
          end
        + case when matched.followed then 500 else 0 end
        + case when (matched.listing).price_cents is not null then 50 else 0 end
        + least(matched.photos, 3) * 10
        + case
            when (matched.listing).created_at > now() - interval '7 days' then 120
            when (matched.listing).created_at > now() - interval '30 days' then 60
            when (matched.listing).created_at > now() - interval '90 days' then 20
            else 0
          end
      ) as score
    from matched
    cross join weights
  ),
  mixed as (
    select m.id, m.slot
    from public.shop_mix((
      select jsonb_agg(jsonb_build_object(
        'id', scored.id,
        'dealer_id', scored.dealer_id,
        'brand_key', scored.brand_key,
        'score', scored.score,
        'created_at', scored.created_at
      ))
      from scored
    )) m
  ),
  slotted as (
    select scored.listing, scored.id, scored.created_at, scored.score, mixed.slot
    from scored
    join mixed on mixed.id = scored.id
  ),
  ordered as (
    select slotted.listing, slotted.score, slotted.slot, slotted.created_at, slotted.id
    from slotted
    left join unpacked on true
    where unpacked.id is null
      or slotted.slot > unpacked.slot
      or (slotted.slot = unpacked.slot and slotted.score < unpacked.score)
      or (
        slotted.slot = unpacked.slot
        and slotted.score = unpacked.score
        and slotted.created_at < unpacked.created_at
      )
      or (
        slotted.slot = unpacked.slot
        and slotted.score = unpacked.score
        and slotted.created_at = unpacked.created_at
        and slotted.id > unpacked.id
      )
    order by slotted.slot, slotted.score desc, slotted.created_at desc, slotted.id
    limit (select lim + 1 from args)
  )
  select
    ordered.listing,
    case
      when (select count(*) from ordered) > (select lim from args) then public.rank_pack_cursor(
        (select o.slot from ordered o order by o.slot, o.score desc, o.created_at desc, o.id offset ((select lim from args) - 1) limit 1),
        (select o.score from ordered o order by o.slot, o.score desc, o.created_at desc, o.id offset ((select lim from args) - 1) limit 1),
        (select o.created_at from ordered o order by o.slot, o.score desc, o.created_at desc, o.id offset ((select lim from args) - 1) limit 1),
        (select o.id from ordered o order by o.slot, o.score desc, o.created_at desc, o.id offset ((select lim from args) - 1) limit 1),
        (select w.taste from weights w)
      )
      else null
    end
  from ordered
  order by ordered.slot, ordered.score desc, ordered.created_at desc, ordered.id
  limit (select lim from args);
$$;


create function public.filter_listing_ids(p_ids uuid[], p_spec jsonb)
returns table (id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id
  from public.listings l
  where l.id = any (p_ids)
    and public.listing_matches(l, coalesce(p_spec, '{}'::jsonb));
$$;

revoke all on function public.rank_taste_hash(jsonb) from public;
revoke all on function public.rank_pack_cursor(integer, integer, timestamptz, uuid, text) from public;
revoke all on function public.rank_unpack_cursor(text) from public;
revoke all on function public.rank_open_cursor(text, jsonb) from public;
revoke all on function public.rank_buy_feed(jsonb, integer, text, jsonb) from public;
revoke all on function public.filter_listing_ids(uuid[], jsonb) from public;

grant execute on function public.rank_pack_cursor(integer, integer, timestamptz, uuid, text) to anon, authenticated, service_role;
grant execute on function public.rank_unpack_cursor(text) to anon, authenticated, service_role;
grant execute on function public.rank_buy_feed(jsonb, integer, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.filter_listing_ids(uuid[], jsonb) to anon, authenticated, service_role;
