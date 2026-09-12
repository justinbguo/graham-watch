-- The deck: active listings the caller neither owns nor has already swiped.
-- security invoker keeps RLS in force for the calling user.
create function public.get_deck(p_limit integer default 20)
returns setof public.listings
language sql
stable
security invoker
set search_path = ''
as $$
  select l.*
  from public.listings l
  where l.status = 'active'
    and l.seller_id <> (select auth.uid())
    and not exists (
      select 1
      from public.swipes s
      where s.listing_id = l.id
        and s.actor_id = (select auth.uid())
    )
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
