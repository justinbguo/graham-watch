-- The Users tab. Counts and rollups for an operator, nothing for anyone else.
--
-- Every figure comes from tables the app already has. auth.users is read
-- only for last_sign_in_at, which is how a daily-active count can include
-- someone who signed in and did not swipe. Email addresses are not selected.
-- A buyer who calls these functions gets the operators-only error before
-- any row is read.

create function public.operator_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  totals jsonb;
  signups_by_day jsonb;
  signups_by_week jsonb;
  activity jsonb;
  onboarding jsonb;
  swipes jsonb;
  top_listings jsonb;
  top_dealers jsonb;
  follows jsonb;
  funnel jsonb;
  dealer_response jsonb;
begin
  perform public.require_operator();

  select jsonb_build_object(
    'users', count(*),
    'onboarded', count(*) filter (where p.onboarded_at is not null),
    'onboarding_rate', case
      when count(*) = 0 then 0
      else round(count(*) filter (where p.onboarded_at is not null)::numeric / count(*), 4)
    end,
    'buyers', count(*) filter (where p.account_type = 'buyer'),
    'dealers', count(*) filter (where p.account_type = 'dealer')
  )
  into totals
  from public.profiles p;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(day::date, 'YYYY-MM-DD'),
    'count', coalesce(s.n, 0)
  ) order by day), '[]'::jsonb)
  into signups_by_day
  from generate_series(
    (current_date - 27)::timestamp,
    current_date::timestamp,
    interval '1 day'
  ) as day
  left join (
    select p.created_at::date as d, count(*)::integer as n
    from public.profiles p
    group by 1
  ) s on s.d = day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', to_char(week::date, 'YYYY-MM-DD'),
    'count', coalesce(s.n, 0)
  ) order by week), '[]'::jsonb)
  into signups_by_week
  from generate_series(
    date_trunc('week', current_date::timestamp) - interval '77 days',
    date_trunc('week', current_date::timestamp),
    interval '1 week'
  ) as week
  left join (
    select date_trunc('week', p.created_at)::date as w, count(*)::integer as n
    from public.profiles p
    group by 1
  ) s on s.w = week::date;

  with day_users as (
    select u.id
    from auth.users u
    where u.last_sign_in_at >= now() - interval '1 day'
    union
    select s.actor_id
    from public.swipes s
    where s.created_at >= now() - interval '1 day'
  ),
  week_users as (
    select u.id
    from auth.users u
    where u.last_sign_in_at >= now() - interval '7 days'
    union
    select s.actor_id
    from public.swipes s
    where s.created_at >= now() - interval '7 days'
  ),
  swipe_days as (
    select
      day::date as day,
      coalesce(s.swipes, 0) as swipes,
      coalesce(s.swipers, 0) as swipers
    from generate_series(
      (current_date - 13)::timestamp,
      current_date::timestamp,
      interval '1 day'
    ) as day
    left join (
      select
        sw.created_at::date as d,
        count(*)::integer as swipes,
        count(distinct sw.actor_id)::integer as swipers
      from public.swipes sw
      where sw.created_at >= current_date - 13
      group by 1
    ) s on s.d = day::date
  )
  select jsonb_build_object(
    'dau', (select count(*) from day_users),
    'wau', (select count(*) from week_users),
    'dau_signins', (
      select count(*) from auth.users u
      where u.last_sign_in_at >= now() - interval '1 day'
    ),
    'wau_signins', (
      select count(*) from auth.users u
      where u.last_sign_in_at >= now() - interval '7 days'
    ),
    'dau_swipers', (
      select count(distinct s.actor_id) from public.swipes s
      where s.created_at >= now() - interval '1 day'
    ),
    'wau_swipers', (
      select count(distinct s.actor_id) from public.swipes s
      where s.created_at >= now() - interval '7 days'
    ),
    'swipes_by_day', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(swipe_days.day, 'YYYY-MM-DD'),
        'swipes', swipe_days.swipes,
        'swipers', swipe_days.swipers
      ) order by swipe_days.day)
      from swipe_days
    ), '[]'::jsonb)
  )
  into activity;

  select jsonb_build_object(
    'favorite_brands', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select btrim(brand) as value, count(*)::integer as count
        from public.profiles p, unnest(p.favorite_brands) as brand
        where p.onboarded_at is not null and btrim(brand) <> ''
        group by 1
        order by count(*) desc, value
        limit 12
      ) t
    ), '[]'::jsonb),
    'hunting_for', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select hunt::text as value, count(*)::integer as count
        from public.profiles p, unnest(p.hunting_for) as hunt
        where p.onboarded_at is not null
        group by 1
        order by count(*) desc, value
      ) t
    ), '[]'::jsonb),
    'collection_size', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select p.collection_size::text as value, count(*)::integer as count
        from public.profiles p
        where p.onboarded_at is not null and p.collection_size is not null
        group by 1
        order by count(*) desc, value
      ) t
    ), '[]'::jsonb),
    'collecting_years', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select p.collecting_years::text as value, count(*)::integer as count
        from public.profiles p
        where p.onboarded_at is not null and p.collecting_years is not null
        group by 1
        order by count(*) desc, value
      ) t
    ), '[]'::jsonb),
    'search_pain_points', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select pain::text as value, count(*)::integer as count
        from public.profiles p, unnest(p.search_pain_points) as pain
        where p.onboarded_at is not null
        group by 1
        order by count(*) desc, value
      ) t
    ), '[]'::jsonb)
  )
  into onboarding;

  select jsonb_build_object(
    'swipes', count(*),
    'right_swipes', count(*) filter (where s.direction = 'right'),
    'right_rate', case
      when count(*) = 0 then 0
      else round(count(*) filter (where s.direction = 'right')::numeric / count(*), 4)
    end,
    'users_who_swiped', count(distinct s.actor_id),
    'per_user', case
      when count(distinct s.actor_id) = 0 then 0
      else round(count(*)::numeric / count(distinct s.actor_id), 2)
    end
  )
  into swipes
  from public.swipes s;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.saves desc, t.brand), '[]'::jsonb)
  into top_listings
  from (
    select
      l.id as listing_id,
      l.brand,
      l.model,
      d.name as dealer_name,
      count(*)::integer as saves
    from public.swipes s
    join public.listings l on l.id = s.listing_id
    join public.dealers d on d.id = l.dealer_id
    where s.direction = 'right'
    group by l.id, l.brand, l.model, d.name
    order by count(*) desc, l.brand
    limit 8
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.saves desc, t.name), '[]'::jsonb)
  into top_dealers
  from (
    select d.id as dealer_id, d.name, count(*)::integer as saves
    from public.swipes s
    join public.listings l on l.id = s.listing_id
    join public.dealers d on d.id = l.dealer_id
    where s.direction = 'right'
    group by d.id, d.name
    order by count(*) desc, d.name
    limit 8
  ) t;

  select jsonb_build_object(
    'total', (select count(*)::integer from public.dealer_follows),
    'dealers', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.followers desc, t.name)
      from (
        select d.id as dealer_id, d.name, count(*)::integer as followers
        from public.dealer_follows f
        join public.dealers d on d.id = f.dealer_id
        group by d.id, d.name
        order by count(*) desc, d.name
        limit 8
      ) t
    ), '[]'::jsonb)
  )
  into follows;

  select jsonb_build_object(
    'inquiries', (select count(*)::integer from public.inquiries),
    'conversations', (select count(*)::integer from public.conversations),
    'messages', (select count(*)::integer from public.messages),
    'fee_cents', coalesce((
      select sum(cd.fee_cents)::bigint
      from public.conversation_deals cd
      where cd.status::text in ('funded', 'shipped', 'completed')
    ), 0),
    'deals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', cd.status::text,
        'count', cd.n,
        'fee_cents', cd.fees
      ) order by cd.status::text)
      from (
        select
          status,
          count(*)::integer as n,
          coalesce(sum(fee_cents), 0)::bigint as fees
        from public.conversation_deals
        group by status
      ) cd
    ), '[]'::jsonb)
  )
  into funnel;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.threads desc, t.name), '[]'::jsonb)
  into dealer_response
  from (
    with asked as (
      select
        c.id as conversation_id,
        c.dealer_id,
        min(m.created_at) filter (where m.sender_id = c.opener_id) as asked_at
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      where c.dealer_id is not null
      group by c.id, c.dealer_id
    ),
    timed as (
      select
        a.dealer_id,
        a.asked_at,
        (
          select min(m.created_at)
          from public.messages m
          join public.dealers d on d.id = a.dealer_id
          where m.conversation_id = a.conversation_id
            and d.claimed_by is not null
            and m.sender_id = d.claimed_by
            and m.created_at >= a.asked_at
        ) as replied_at
      from asked a
      where a.asked_at is not null
    )
    select
      d.id as dealer_id,
      d.name,
      count(*)::integer as threads,
      count(t.replied_at)::integer as answered,
      round(count(t.replied_at)::numeric / count(*), 4) as response_rate,
      percentile_cont(0.5) within group (
        order by extract(epoch from (t.replied_at - t.asked_at))
      ) filter (where t.replied_at is not null) as median_response_seconds
    from timed t
    join public.dealers d on d.id = t.dealer_id
    group by d.id, d.name
    order by count(*) desc, d.name
    limit 20
  ) t;

  return jsonb_build_object(
    'totals', totals,
    'signups_by_day', signups_by_day,
    'signups_by_week', signups_by_week,
    'activity', activity,
    'onboarding', onboarding,
    'swipes', swipes,
    'top_saved_listings', top_listings,
    'top_saved_dealers', top_dealers,
    'follows', follows,
    'funnel', funnel,
    'dealer_response', dealer_response
  );
end;
$$;

revoke all on function public.operator_dashboard() from public, anon;
grant execute on function public.operator_dashboard() to authenticated, service_role;

create function public.operator_recent_users(p_limit integer default 40)
returns table (
  id uuid,
  handle text,
  first_name text,
  account_type public.account_type,
  created_at timestamptz,
  onboarded boolean,
  swipe_count bigint,
  last_active timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  perform public.require_operator();

  return query
    select
      p.id,
      p.handle,
      p.first_name,
      p.account_type,
      p.created_at,
      p.onboarded_at is not null,
      coalesce(s.n, 0)::bigint,
      greatest(u.last_sign_in_at, s.last_swipe)
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join (
      select sw.actor_id, count(*)::bigint as n, max(sw.created_at) as last_swipe
      from public.swipes sw
      group by sw.actor_id
    ) s on s.actor_id = p.id
    order by p.created_at desc
    limit lim;
end;
$$;

revoke all on function public.operator_recent_users(integer) from public, anon;
grant execute on function public.operator_recent_users(integer) to authenticated, service_role;

create function public.operator_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  person public.profiles;
  result jsonb;
begin
  perform public.require_operator();

  select * into person from public.profiles p where p.id = p_user_id;
  if person.id is null then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', person.id,
    'handle', person.handle,
    'first_name', person.first_name,
    'account_type', person.account_type,
    'onboarded', person.onboarded_at is not null,
    'favorite_brands', person.favorite_brands,
    'hunting_for', person.hunting_for,
    'collection_size', person.collection_size,
    'collecting_years', person.collecting_years,
    'search_pain_points', person.search_pain_points,
    'saves', coalesce((
      select jsonb_agg(jsonb_build_object(
        'listing_id', l.id,
        'brand', l.brand,
        'model', l.model,
        'reference', l.reference,
        'dealer_name', d.name,
        'saved_at', s.created_at
      ) order by s.created_at desc)
      from (
        select sw.listing_id, sw.created_at
        from public.swipes sw
        where sw.actor_id = person.id and sw.direction = 'right'
        order by sw.created_at desc
        limit 40
      ) s
      join public.listings l on l.id = s.listing_id
      join public.dealers d on d.id = l.dealer_id
    ), '[]'::jsonb),
    'follows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dealer_id', d.id,
        'name', d.name
      ) order by f.created_at desc)
      from public.dealer_follows f
      join public.dealers d on d.id = f.dealer_id
      where f.user_id = person.id
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.operator_user_detail(uuid) from public, anon;
grant execute on function public.operator_user_detail(uuid) to authenticated, service_role;
