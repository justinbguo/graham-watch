-- A caller who does not manage the shop gets the on-deck count only.
-- Sold totals and the sync stamp stay null. Those rows are not in the guest catalogue.

create or replace function public.dealer_reputation(p_dealer_id uuid)
returns table (
  joined_at timestamptz,
  listings_live integer,
  watches_sold integer,
  last_refreshed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.created_at,
    (
      select count(*)
      from public.listings l
      where l.dealer_id = d.id
        and case
          when public.controls_dealer(d.id)
            then l.status = 'active' and l.sold_at is null
          else public.listing_on_deck(l)
        end
    )::integer,
    case
      when public.controls_dealer(d.id) then (
        select count(*)
        from public.listings l
        where l.dealer_id = d.id
          and l.sold_at is not null
      )::integer
      else null
    end,
    case
      when public.controls_dealer(d.id) then coalesce(
        d.last_synced_at,
        (
          select max(l.availability_checked_at)
          from public.listings l
          where l.dealer_id = d.id
        )
      )
      else null
    end
  from public.dealers d
  where d.id = p_dealer_id
    and (
      d.permission = 'approved'
      or public.controls_dealer(d.id)
    );
$$;

revoke all on function public.dealer_reputation(uuid) from public;
grant execute on function public.dealer_reputation(uuid) to anon, authenticated, service_role;
