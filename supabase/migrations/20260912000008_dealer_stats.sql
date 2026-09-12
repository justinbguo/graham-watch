-- What a dealer is allowed to know: how many people saved a watch and how many
-- asked to be introduced. Never who, and never what else those people looked at.
--
-- security definer because swipes are readable only by the person who made them,
-- which is the rule worth keeping. The function reads past it to count rows and
-- returns nothing but totals, so the guard at the top is the whole security
-- boundary — it must run before anything is read.
create function public.dealer_stats(p_dealer_id uuid)
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
  if not exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and (d.claimed_by = (select auth.uid()) or d.created_by = (select auth.uid()))
  ) then
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
      -- Scalar subqueries rather than joins: joining both tables multiplies rows
      -- and every count comes out wrong in a way that looks plausible.
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

-- Postgres grants execute to PUBLIC by default, which anon inherits. Revoking
-- from anon alone leaves that inherited grant in place.
revoke execute on function public.dealer_stats(uuid) from public;
grant execute on function public.dealer_stats(uuid) to authenticated;

-- Inquiries carry the buyer's message and must reach the dealer, but the dealer
-- has no account yet. Reading them stays an operator job until they do.
create policy "dealers read inquiries for their listings"
on public.inquiries for select to authenticated
using (
  exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and d.claimed_by = (select auth.uid())
  )
);
