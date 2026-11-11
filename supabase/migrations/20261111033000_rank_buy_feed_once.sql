-- Anon used to spend seconds on the first Buy page. The score expression was
-- inlined into every sort key, so each listing recounted its photographs
-- under the photo policy, and that policy read the listing again. Prod guests
-- sat around 3 to 5 seconds and tripped the 3 second anon cap.
--
-- This function runs as its owner and applies the same visibility the policies
-- already require, so a guest still cannot read a thin gallery, a sold watch,
-- or an unapproved shop. Weights are computed once. Photographs are counted
-- once. The follow boost is one lookup for the signed-in caller.
--
-- Supabase seeds anon with statement_timeout = 3s. Prod was raised to 8s by
-- hand so a slow page could finish. Local and CI use that same cap. The page
-- itself should finish well under it.

alter role anon set statement_timeout = '8s';

create or replace function public.rank_buy_feed(
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
    select public.rank_weights(coalesce(p_seed, '{}'::jsonb)) as w
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
    select * from public.rank_unpack_cursor(p_cursor)
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

revoke all on function public.rank_buy_feed(jsonb, integer, text, jsonb) from public;
grant execute on function public.rank_buy_feed(jsonb, integer, text, jsonb) to anon, authenticated, service_role;
