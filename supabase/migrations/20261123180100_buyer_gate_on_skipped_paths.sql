create function public.drop_candidate_listings(p_now timestamptz)
returns table (
  id uuid,
  dealer_id uuid,
  created_at timestamptz,
  status public.listing_status,
  sold_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = '22023';
  end if;

  return query
  select
    l.id,
    l.dealer_id,
    l.created_at,
    l.status,
    l.sold_at
  from public.listings l
  where public.listing_on_deck(l)
    and l.created_at >= p_now - public.drop_max_age()
    and exists (
      select 1
      from public.dealer_follows f
      where f.dealer_id = l.dealer_id
    )
  order by l.id;
end;
$$;

revoke all on function public.drop_candidate_listings(timestamptz) from public, anon, authenticated;
grant execute on function public.drop_candidate_listings(timestamptz) to service_role;

drop policy "signed-in buyers skip rolex and post-1985" on public.listings;
create policy "signed-in buyers skip rolex and post-1985"
on public.listings
as restrictive
for select
to authenticated
using (
  public.listing_for_buyer(listings)
  or listings.imported_by = (select auth.uid())
  or public.is_operator()
  or public.controls_dealer(listings.dealer_id)
);

create or replace function public.dealer_stats(p_dealer_id uuid)
returns table (
  listing_id uuid,
  brand text,
  model text,
  price_cents bigint,
  saves bigint,
  passes bigint,
  inquiries bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.controls_dealer(p_dealer_id) then
    raise exception 'Not your dealer.' using errcode = '42501';
  end if;

  return query
  select
    counted.listing_id,
    counted.brand,
    counted.model,
    counted.price_cents,
    counted.saves,
    counted.passes,
    counted.inquiries
  from (
    select
      l.id as listing_id,
      l.brand,
      l.model,
      l.price_cents,
      (select count(*) from public.swipes s where s.listing_id = l.id and s.direction = 'right')
        as saves,
      (select count(*) from public.swipes s where s.listing_id = l.id and s.direction = 'left')
        as passes,
      (select count(*) from public.inquiries i where i.listing_id = l.id) as inquiries,
      l.created_at
    from public.listings l
    where l.dealer_id = p_dealer_id
  ) counted
  order by counted.inquiries desc, counted.saves desc, counted.created_at desc;
end;
$$;

revoke execute on function public.dealer_stats(uuid) from public;
grant execute on function public.dealer_stats(uuid) to authenticated;
