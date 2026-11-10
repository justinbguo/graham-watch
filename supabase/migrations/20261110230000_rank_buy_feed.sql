-- The weights match src/data/rank.ts. Undo pops the latest action on that
-- watch and adds nothing itself. Unsave pops the latest save. The brand
-- takes that full weight. The style and the price band take a smaller share.
--
-- The page is not sorted by that score alone. Each brand's best remaining
-- watch is a round, and the round is ordered by score. A brand cannot take
-- a second seat while another brand still has a watch in that round. The
-- cursor is that order, so the next page continues it.

create function public.rank_bump(p_weights jsonb, p_group text, p_key text, p_amount integer)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_key is null or p_key = '' or p_amount is null or p_amount = 0 then p_weights
    else jsonb_set(
      p_weights,
      array[p_group, p_key],
      to_jsonb(coalesce((p_weights #>> array[p_group, p_key])::integer, 0) + p_amount),
      true
    )
  end;
$$;

/**
 * The caller's own taste, as weights. buyer_events has no select grant, so
 * this is security definer and it never takes a user id: auth.uid() is the
 * only buyer it can see. The return is totals, not the rows.
 */
create function public.buyer_taste()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  open_actions jsonb := '{}'::jsonb;
  weights jsonb := '{"brand":{},"style":{},"band":{}}'::jsonb;
  ev record;
  row record;
  stack jsonb;
  brand text;
  sty text;
  cents integer;
  band text;
  action text;
  i integer;
  w integer;
  facet integer;
begin
  if uid is null then
    return weights;
  end if;

  for ev in
    select e.kind::text as kind, e.listing_id
    from public.buyer_events e
    where e.user_id = uid
      and e.kind in ('save', 'pass', 'dealer_click', 'undo', 'unsave')
      and e.listing_id is not null
    order by e.occurred_at, e.id
  loop
    stack := coalesce(open_actions -> ev.listing_id::text, '[]'::jsonb);
    if ev.kind = 'undo' then
      if jsonb_array_length(stack) > 0 then
        stack := stack - (jsonb_array_length(stack) - 1);
      end if;
    elsif ev.kind = 'unsave' then
      for i in reverse jsonb_array_length(stack) - 1 .. 0 loop
        if stack ->> i = 'save' then
          stack := stack - i;
          exit;
        end if;
      end loop;
    else
      stack := stack || to_jsonb(ev.kind);
    end if;
    open_actions := jsonb_set(open_actions, array[ev.listing_id::text], stack, true);
  end loop;

  for row in
    select key as listing_id, value as stack
    from jsonb_each(open_actions)
  loop
    brand := null;
    sty := null;
    cents := null;
    select l.brand_key, l.style::text, l.price_cents
      into brand, sty, cents
    from public.listings l
    where l.id = row.listing_id::uuid;

    band := case
      when cents is null then null
      when cents < 500000 then 'low'
      when cents < 1500000 then 'mid'
      else 'high'
    end;

    for i in 0 .. jsonb_array_length(row.stack) - 1 loop
      action := row.stack ->> i;
      w := case action
        when 'dealer_click' then 300
        when 'save' then 200
        when 'pass' then -100
        else 0
      end;
      facet := case action
        when 'dealer_click' then 100
        when 'save' then 60
        when 'pass' then -30
        else 0
      end;
      if w = 0 then
        continue;
      end if;
      weights := public.rank_bump(weights, 'brand', brand, w);
      weights := public.rank_bump(weights, 'style', sty, facet);
      weights := public.rank_bump(weights, 'band', band, facet);
    end loop;
  end loop;

  return weights;
end;
$$;

create function public.rank_weights(p_seed jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  weights jsonb := public.buyer_taste();
  uid uuid := (select auth.uid());
  item text;
  band text;
begin
  if uid is not null then
    for item in
      select public.brand_key(b)
      from public.profiles p
      cross join lateral unnest(p.favorite_brands) as b
      where p.id = uid
    loop
      weights := public.rank_bump(weights, 'brand', item, 250);
    end loop;
  end if;

  if jsonb_typeof(p_seed) is distinct from 'object' then
    return weights;
  end if;

  for item in
    select public.brand_key(value)
    from jsonb_array_elements_text(coalesce(p_seed -> 'brands', '[]'::jsonb)) as value
  loop
    weights := public.rank_bump(weights, 'brand', item, 250);
  end loop;

  for item in
    select value
    from jsonb_array_elements_text(coalesce(p_seed -> 'styles', '[]'::jsonb)) as value
  loop
    begin
      perform item::public.watch_style;
      weights := public.rank_bump(weights, 'style', item, 100);
    exception
      when invalid_text_representation then
        null;
    end;
  end loop;

  band := p_seed ->> 'priceBand';
  if band in ('low', 'mid', 'high') then
    weights := public.rank_bump(weights, 'band', band, 100);
  end if;

  return weights;
end;
$$;

-- Anon has no privilege on dealer_follows. A definer function returns one
-- boolean for the signed-in caller and never the row.
create function public.rank_followed(p_dealer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) is not null and exists (
    select 1
    from public.dealer_follows f
    where f.user_id = (select auth.uid())
      and f.dealer_id = p_dealer
  ), false);
$$;

create function public.rank_pack_cursor(
  p_slot integer,
  p_score integer,
  p_created_at timestamptz,
  p_id uuid
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
        'id', p_id
      )::text,
      'utf8'
    ),
    'base64'
  );
$$;

create function public.rank_unpack_cursor(p_cursor text)
returns table (slot integer, score integer, created_at timestamptz, id uuid)
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
  select c.slot, c.score, c.created_at, c.id
  from jsonb_to_record(convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb)
    as c(slot integer, score integer, created_at timestamptz, id uuid);
exception
  when others then
    raise exception 'bad listing cursor' using errcode = '22023';
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
security invoker
set search_path = ''
as $$
  with args as (
    select
      coalesce(p_spec, '{}'::jsonb) as spec,
      least(greatest(coalesce(p_limit, 20), 1), 50) as lim
  ),
  weights as (
    select public.rank_weights(coalesce(p_seed, '{}'::jsonb)) as w
  ),
  unpacked as (
    select * from public.rank_unpack_cursor(p_cursor)
  ),
  matched as (
    select
      l as listing,
      (select count(*)::integer from public.listing_photos p where p.listing_id = l.id) as photos
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
    cross join args
    where l.status = 'active'
      and l.sold_at is null
      and d.permission = 'approved'
      and public.discovery_visible_to_caller(true, l.imported_by, d.claimed_by)
      and not exists (
        select 1
        from public.swipes s
        where s.listing_id = l.id
          and s.actor_id = (select auth.uid())
      )
      and public.listing_matches(l, args.spec)
  ),
  scored as (
    select
      matched.listing,
      (matched.listing).id as id,
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
        + case when public.rank_followed((matched.listing).dealer_id) then 500 else 0 end
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
  slotted as (
    select
      scored.listing,
      scored.id,
      scored.created_at,
      scored.score,
      row_number() over (
        partition by coalesce(scored.brand_key, scored.id::text)
        order by scored.score desc, scored.created_at desc, scored.id
      )::integer as slot
    from scored
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
        (select o.id from ordered o order by o.slot, o.score desc, o.created_at desc, o.id offset ((select lim from args) - 1) limit 1)
      )
      else null
    end
  from ordered
  order by ordered.slot, ordered.score desc, ordered.created_at desc, ordered.id
  limit (select lim from args);
$$;

revoke all on function public.rank_bump(jsonb, text, text, integer) from public;
revoke all on function public.buyer_taste() from public;
revoke all on function public.rank_weights(jsonb) from public;
revoke all on function public.rank_followed(uuid) from public;
revoke all on function public.rank_pack_cursor(integer, integer, timestamptz, uuid) from public;
revoke all on function public.rank_unpack_cursor(text) from public;
revoke all on function public.rank_buy_feed(jsonb, integer, text, jsonb) from public;

grant execute on function public.rank_bump(jsonb, text, text, integer) to anon, authenticated, service_role;
grant execute on function public.buyer_taste() to anon, authenticated, service_role;
grant execute on function public.rank_weights(jsonb) to anon, authenticated, service_role;
grant execute on function public.rank_followed(uuid) to anon, authenticated, service_role;
grant execute on function public.rank_pack_cursor(integer, integer, timestamptz, uuid) to anon, authenticated, service_role;
grant execute on function public.rank_unpack_cursor(text) to anon, authenticated, service_role;
grant execute on function public.rank_buy_feed(jsonb, integer, text, jsonb) to anon, authenticated, service_role;
