-- Buyers who engaged with this shop's listings. Names only people who saved,
-- passed, or inquired — not everyone who saw a watch in the deck.
create function public.dealer_top_customers(p_dealer_id uuid)
returns table (
  buyer_id uuid,
  handle text,
  display_name text,
  saves bigint,
  passes bigint,
  inquiries bigint,
  last_active timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  ) then
    raise exception 'Not your dealer.' using errcode = '42501';
  end if;

  return query
  with saves_passes as (
    select
      s.actor_id as buyer_id,
      count(*) filter (where s.direction = 'right') as saves,
      count(*) filter (where s.direction = 'left') as passes,
      max(s.created_at) as last_swipe
    from public.swipes s
    inner join public.listings l on l.id = s.listing_id and l.dealer_id = p_dealer_id
    group by s.actor_id
  ),
  inq as (
    select
      i.buyer_id,
      count(*) as inquiries,
      max(i.created_at) as last_inquiry
    from public.inquiries i
    where i.dealer_id = p_dealer_id
    group by i.buyer_id
  ),
  combined as (
    select
      coalesce(sp.buyer_id, inq.buyer_id) as buyer_id,
      coalesce(sp.saves, 0) as saves,
      coalesce(sp.passes, 0) as passes,
      coalesce(inq.inquiries, 0) as inquiries,
      greatest(sp.last_swipe, inq.last_inquiry) as last_active
    from saves_passes sp
    full outer join inq on inq.buyer_id = sp.buyer_id
  )
  select
    c.buyer_id,
    p.handle,
    trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as display_name,
    c.saves,
    c.passes,
    c.inquiries,
    c.last_active
  from combined c
  inner join public.profiles p on p.id = c.buyer_id
  order by c.saves desc, c.inquiries desc, c.last_active desc nulls last
  limit 50;
end;
$$;

revoke execute on function public.dealer_top_customers(uuid) from public;
grant execute on function public.dealer_top_customers(uuid) to authenticated;
