-- Buyers do not see a Rolex, or a watch whose stored year is after 1985.
--
-- listings.year is one integer. The importer stores a specific year as that
-- year, a decade as its first year, and a circa date as that year. Null means
-- the page did not state a year, and those watches stay. 1985 stays. Tudor
-- stays. "Rolex SA" becomes brand_key rolexsa, so a key that starts with
-- rolex is the same brand.
--
-- listing_for_buyer is the one predicate. listing_on_deck calls it, so the
-- anon policy, the New tab, the seal, and a guest's shop count follow.
-- rank_buy_feed is security definer and does not consult that policy, so it
-- calls the predicate itself. A restrictive select policy covers every
-- security-invoker read (search, a shop page, the wishlist, a direct link).
-- The shop's owner, the importer, and an operator can still read the row.

create function public.listing_for_buyer(p_listing public.listings)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select not (
      coalesce(p_listing.brand_key, '') like 'rolex%'
      or lower(btrim(p_listing.brand)) ~ '^rolex([^a-z]|$)'
    )
    and (p_listing.year is null or p_listing.year <= 1985);
$$;

revoke all on function public.listing_for_buyer(public.listings) from public;
grant execute on function public.listing_for_buyer(public.listings) to anon, authenticated, service_role;

create or replace function public.listing_on_deck(p_listing public.listings)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_listing.status = 'active'
    and p_listing.sold_at is null
    and public.listing_gallery_ready(p_listing.id)
    and public.listing_for_buyer(p_listing)
    and exists (
      select 1
      from public.dealers d
      where d.id = p_listing.dealer_id
        and d.permission = 'approved'
    );
$$;

revoke all on function public.listing_on_deck(public.listings) from public;
grant execute on function public.listing_on_deck(public.listings) to anon, authenticated, service_role;

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

-- New has no taste, so every watch scores 0 and the newest leads each turn.
-- The ids stay filtered by listing_on_deck, so a caller learns only ids a
-- guest could already read.
create or replace function public.latest_catalogue_batch()
returns table (batch_id uuid, sealed_at timestamptz, listing_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.sealed_at,
    coalesce(
      (
        with on_deck as (
          select l.id, l.dealer_id, l.brand_key, l.created_at
          from public.catalogue_batch_listings m
          join public.listings l on l.id = m.listing_id
          where m.batch_id = b.id
            and public.listing_on_deck(l)
        )
        select array_agg(on_deck.id order by mixed.slot, on_deck.created_at desc, on_deck.id)
        from on_deck
        join public.shop_mix((
          select jsonb_agg(jsonb_build_object(
            'id', o.id,
            'dealer_id', o.dealer_id,
            'brand_key', o.brand_key,
            'score', 0,
            'created_at', o.created_at
          ))
          from on_deck o
        )) mixed on mixed.id = on_deck.id
      ),
      '{}'::uuid[]
    )
  from (
    select c.id, c.sealed_at
    from public.catalogue_batches c
    order by c.sealed_at desc, c.id desc
    limit 1
  ) b;
$$;


-- Permissive policies are OR'd, so a new permissive policy cannot hide a row.
-- Anon must not call is_operator(): that function is not granted to anon.
create policy "anon buyers skip rolex and post-1985"
on public.listings
as restrictive
for select
to anon
using (public.listing_for_buyer(listings));

create policy "signed-in buyers skip rolex and post-1985"
on public.listings
as restrictive
for select
to authenticated
using (
  public.listing_for_buyer(listings)
  or imported_by = (select auth.uid())
  or public.is_operator()
  or exists (
    select 1
    from public.dealers d
    where d.id = listings.dealer_id
      and (
        d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
      )
  )
);
