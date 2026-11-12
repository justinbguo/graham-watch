create index buyer_events_acts_idx
  on public.buyer_events (user_id, kind)
  where kind in ('save', 'pass', 'dealer_click');

comment on table public.buyer_events is
  'Append-only buyer behavior. Written only by log_buyer_events. Read by service_role, and by operators through operator_accounts and operator_account. Account deletion cascades. Listing and shop deletion does not.';

-- jsonb, not a table. PostgREST stops a set at max_rows (1000) without
-- saying so, and the list has to show every account. One value is one row.
create function public.operator_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', p.id,
      'collector_number', p.collector_number,
      'email', u.email,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'handle', p.handle,
      'account_type', p.account_type,
      'created_at', p.created_at,
      'onboarded_at', p.onboarded_at,
      'last_active', greatest(u.last_sign_in_at, latest.occurred_at),
      'swipes_right', coalesce(acts.saves, 0),
      'swipes_left', coalesce(acts.passes, 0),
      'dealer_clicks', coalesce(acts.clicks, 0),
      'follows', coalesce(follows.n, 0)
    )) order by p.collector_number)
    from public.profiles p
    join auth.users u on u.id = p.id
    left join (
      select
        e.user_id,
        count(*) filter (where e.kind = 'save') as saves,
        count(*) filter (where e.kind = 'pass') as passes,
        count(*) filter (where e.kind = 'dealer_click') as clicks
      from public.buyer_events e
      where e.kind in ('save', 'pass', 'dealer_click')
      group by e.user_id
    ) acts on acts.user_id = p.id
    left join (
      select f.user_id, count(*) as n
      from public.dealer_follows f
      group by f.user_id
    ) follows on follows.user_id = p.id
    -- occurred_at is the device clock. The clamp sits inside the lateral so an
    -- account with no events stays null; least() outside would turn null into now().
    left join lateral (
      select least(e.occurred_at, now()) as occurred_at
      from public.buyer_events e
      where e.user_id = p.id
      order by e.occurred_at desc
      limit 1
    ) latest on true
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.operator_accounts() from public, anon;
grant execute on function public.operator_accounts() to authenticated, service_role;

comment on function public.operator_accounts() is
  'Every account with its email, for the operator Accounts screen. The one operator function that reads auth.users.email. Operators only.';

create function public.operator_account(p_user_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cap constant integer := 2000;
  lim integer := least(greatest(coalesce(p_limit, 200), 1), cap);
  person public.profiles;
  onboarding jsonb;
  taste jsonb;
  timeline jsonb;
  total integer;
begin
  perform public.require_operator();

  select * into person from public.profiles p where p.id = p_user_id;
  if person.id is null then
    raise exception 'No such account.' using errcode = 'P0002';
  end if;

  onboarding := jsonb_strip_nulls(jsonb_build_object(
    'onboarded_at', person.onboarded_at,
    'favorite_brands', person.favorite_brands,
    'hunting_for', person.hunting_for,
    'collection_size', person.collection_size,
    'collecting_years', person.collecting_years,
    'search_pain_points', person.search_pain_points
  ));

  with positive as (
    select s.listing_id
    from public.swipes s
    where s.actor_id = person.id and s.direction = 'right'
    union
    select e.listing_id
    from public.buyer_events e
    where e.user_id = person.id and e.kind = 'dealer_click'
    union
    select i.listing_id
    from public.inquiries i
    where i.buyer_id = person.id
  ),
  watches as (
    select l.id, l.brand, l.brand_key, l.dealer_id, l.price_cents, l.currency
    from positive
    join public.listings l on l.id = positive.listing_id
  ),
  priced as (
    select w.currency, w.price_cents
    from watches w
    where w.price_cents > 0
      and w.currency = (
        select w2.currency
        from watches w2
        where w2.price_cents > 0
        group by w2.currency
        order by count(*) desc, w2.currency
        limit 1
      )
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'positive', (select count(*) from watches),
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('value', b.value, 'count', b.n) order by b.n desc, b.value)
      from (
        select mode() within group (order by w.brand) as value, count(*)::integer as n
        from watches w
        group by coalesce(w.brand_key, lower(btrim(w.brand)))
        order by n desc, value
        limit 5
      ) b
    ), '[]'::jsonb),
    'shops', coalesce((
      select jsonb_agg(jsonb_build_object('value', s.value, 'count', s.n) order by s.n desc, s.value)
      from (
        select d.name as value, count(*)::integer as n
        from watches w
        join public.dealers d on d.id = w.dealer_id
        group by d.id, d.name
        order by n desc, value
        limit 5
      ) s
    ), '[]'::jsonb),
    'price', (
      select jsonb_build_object(
        'currency', min(pr.currency),
        'min_cents', min(pr.price_cents),
        'max_cents', max(pr.price_cents),
        'count', count(*)
      )
      from priced pr
      having count(*) > 0
    ),
    'following', coalesce((
      select jsonb_agg(d.name order by f.created_at desc)
      from public.dealer_follows f
      join public.dealers d on d.id = f.dealer_id
      where f.user_id = person.id
    ), '[]'::jsonb)
  ))
  into taste;

  with dwells as (
    select d.exposure_id, max(d.dwell_ms) as dwell_ms
    from public.buyer_events d
    where d.user_id = person.id
      and d.kind = 'dwell'
      and d.surface in ('detail', 'viewer')
    group by d.exposure_id
  ),
  kept as (
    select
      e.id,
      case when e.kind = 'impression' then 'open' else e.kind::text end as kind,
      e.occurred_at as at,
      e.surface::text as surface,
      e.guest_key is not null as guest,
      round(dw.dwell_ms / 1000.0)::integer as seconds,
      e.filter,
      null::text as status,
      null::timestamptz as opened_at,
      null::timestamptz as sent_at,
      null::text as message,
      e.listing_id,
      e.dealer_id
    from public.buyer_events e
    left join dwells dw on e.kind = 'impression' and dw.exposure_id = e.exposure_id
    where e.user_id = person.id
      and e.kind not in ('dwell', 'inquiry_open')
      and (e.kind <> 'impression' or e.surface in ('detail', 'viewer'))
    union all
    select
      i.id,
      'inquiry',
      i.created_at,
      null,
      false,
      null,
      null,
      i.status::text,
      i.opened_at,
      i.sent_at,
      i.message,
      i.listing_id,
      i.dealer_id
    from public.inquiries i
    where i.buyer_id = person.id
  ),
  page as (
    select k.*
    from kept k
    order by k.at desc, k.id desc
    limit lim
  )
  select
    (select count(*)::integer from kept),
    coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', pg.id,
        'kind', pg.kind,
        'at', pg.at,
        'surface', pg.surface,
        'guest', pg.guest,
        'seconds', pg.seconds,
        'filter', pg.filter,
        'status', pg.status,
        'opened_at', pg.opened_at,
        'sent_at', pg.sent_at,
        'message', pg.message,
        'listing_id', pg.listing_id,
        'brand', l.brand,
        'model', l.model,
        'price_cents', l.price_cents,
        'currency', l.currency,
        'thumb_path', photo.storage_path,
        'thumb_source_url', photo.source_url,
        'dealer_id', pg.dealer_id,
        'dealer_name', d.name
      )) order by pg.at desc, pg.id desc)
      from page pg
      left join public.listings l on l.id = pg.listing_id
      left join public.dealers d on d.id = pg.dealer_id
      left join lateral (
        select ph.storage_path, ph.source_url
        from public.listing_photos ph
        where ph.listing_id = pg.listing_id
        order by ph.position
        limit 1
      ) photo on true
    ), '[]'::jsonb)
  into total, timeline;

  return jsonb_build_object(
    'id', person.id,
    'onboarding', onboarding,
    'taste', taste,
    'timeline', timeline,
    'total', total,
    'more', total > lim and lim < cap
  );
end;
$$;

revoke all on function public.operator_account(uuid, integer) from public, anon;
grant execute on function public.operator_account(uuid, integer) to authenticated, service_role;

comment on function public.operator_account(uuid, integer) is
  'One account''s onboarding answers, taste, and timeline for the operator Accounts screen. No email. Operators only.';

drop function public.operator_recent_users(integer);
drop function public.operator_user_detail(uuid);
