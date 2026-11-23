alter table public.listings
  add column photo_count integer not null default 0;

update public.listings as listing
set photo_count = counted.photos
from (
  select listing_id, count(*)::integer as photos
  from public.listing_photos
  group by listing_id
) as counted
where listing.id = counted.listing_id;

create function public.sync_listing_photo_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if tg_op = 'INSERT' then
    target := new.listing_id;
    update public.listings
    set photo_count = (
      select count(*)::integer from public.listing_photos where listing_id = target
    )
    where id = target;
  elsif tg_op = 'DELETE' then
    target := old.listing_id;
    update public.listings
    set photo_count = (
      select count(*)::integer from public.listing_photos where listing_id = target
    )
    where id = target;
  else
    target := new.listing_id;
    update public.listings
    set photo_count = (
      select count(*)::integer from public.listing_photos where listing_id = target
    )
    where id = target;
    if new.listing_id is distinct from old.listing_id then
      target := old.listing_id;
      update public.listings
      set photo_count = (
        select count(*)::integer from public.listing_photos where listing_id = target
      )
      where id = target;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_listing_photo_count() from public, anon, authenticated, service_role;

create trigger listing_photos_sync_count
after insert or delete or update of listing_id on public.listing_photos
for each row execute function public.sync_listing_photo_count();

create function public.net_taste_actions(kinds text[])
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  stack text[] := '{}';
  kind text;
  index integer;
begin
  if kinds is null then
    return stack;
  end if;
  foreach kind in array kinds loop
    if kind = 'undo' then
      if cardinality(stack) > 0 then
        stack := stack[1:cardinality(stack) - 1];
      end if;
    elsif kind = 'unsave' then
      for index in reverse cardinality(stack) .. 1 loop
        if stack[index] = 'save' then
          stack := stack[1:index - 1] || stack[index + 1:cardinality(stack)];
          exit;
        end if;
      end loop;
    elsif kind in ('save', 'pass', 'dealer_click') then
      stack := stack || kind;
    end if;
  end loop;
  return stack;
end;
$$;

revoke all on function public.net_taste_actions(text[]) from public, anon, authenticated, service_role;

create or replace function public.buyer_taste()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select auth.uid() as uid
  ),
  stacks as (
    select
      e.listing_id,
      public.net_taste_actions(array_agg(e.kind::text order by e.occurred_at, e.id)) as actions
    from public.buyer_events e
    cross join caller
    where caller.uid is not null
      and e.user_id = caller.uid
      and e.kind in ('save', 'pass', 'dealer_click', 'undo', 'unsave')
      and e.listing_id is not null
    group by e.listing_id
  ),
  scored as (
    select
      l.brand_key as brand,
      l.style::text as sty,
      case
        when l.price_cents is null then null
        when l.price_cents < 500000 then 'low'
        when l.price_cents < 1500000 then 'mid'
        else 'high'
      end as band,
      case a.action
        when 'dealer_click' then 300
        when 'save' then 200
        when 'pass' then -100
        else 0
      end as w,
      case a.action
        when 'dealer_click' then 100
        when 'save' then 60
        when 'pass' then -30
        else 0
      end as facet
    from stacks s
    join public.listings l on l.id = s.listing_id
    cross join lateral unnest(s.actions) as a(action)
  )
  select jsonb_build_object(
    'brand', coalesce((
      select jsonb_object_agg(brand, total)
      from (
        select brand, sum(w)::integer as total
        from scored
        where brand is not null and brand <> '' and w <> 0
        group by brand
      ) totals
    ), '{}'::jsonb),
    'style', coalesce((
      select jsonb_object_agg(sty, total)
      from (
        select sty, sum(facet)::integer as total
        from scored
        where sty is not null and sty <> '' and facet <> 0
        group by sty
      ) totals
    ), '{}'::jsonb),
    'band', coalesce((
      select jsonb_object_agg(band, total)
      from (
        select band, sum(facet)::integer as total
        from scored
        where band is not null and facet <> 0
        group by band
      ) totals
    ), '{}'::jsonb)
  );
$$;

drop function public.rank_buy_feed(jsonb, integer, text, jsonb);

create function public.rank_buy_feed(
  p_spec jsonb default '{}'::jsonb,
  p_limit integer default 20,
  p_cursor text default null,
  p_seed jsonb default '{}'::jsonb
)
returns table (listing public.listings, cursor text, cover_storage_path text, cover_source_url text)
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
      l.photo_count as photos,
      (fl.dealer_id is not null) as followed
    from public.listings l
    join public.dealers d on d.id = l.dealer_id
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
        l.photo_count >= 3
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
    end,
    cover.storage_path,
    cover.source_url
  from ordered
  left join lateral (
    select p.storage_path, p.source_url
    from public.listing_photos p
    where p.listing_id = (ordered.listing).id
    order by p.position, p.id
    limit 1
  ) cover on true
  order by ordered.slot, ordered.score desc, ordered.created_at desc, ordered.id
  limit (select lim from args);
$$;


revoke all on function public.rank_buy_feed(jsonb, integer, text, jsonb) from public;
grant execute on function public.rank_buy_feed(jsonb, integer, text, jsonb) to anon, authenticated, service_role;
