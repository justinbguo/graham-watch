-- A claim is ownership, not publication. The shop must prove control of the
-- contact address already used for inquiries; permission remains an operator
-- decision and is never changed here.
create function public.dealer_accounts()
returns table (
  id uuid,
  name text,
  website text,
  permission public.dealer_permission,
  claimed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.website, d.permission, d.claimed_by = (select auth.uid())
  from public.dealers d
  join auth.users u on u.id = (select auth.uid())
  where d.claimed_by = (select auth.uid())
     or (
       d.claimed_by is null
       and d.contact_email is not null
       and lower(trim(d.contact_email)) = lower(trim(u.email))
     )
  order by d.name;
$$;

revoke execute on function public.dealer_accounts() from public;
grant execute on function public.dealer_accounts() to authenticated;

create function public.claim_dealer(p_dealer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  update public.dealers d
  set claimed_by = (select auth.uid())
  from auth.users u
  where d.id = p_dealer_id
    and u.id = (select auth.uid())
    and (
      d.claimed_by = (select auth.uid())
      or (
        d.claimed_by is null
        and d.contact_email is not null
        and lower(trim(d.contact_email)) = lower(trim(u.email))
      )
    )
  returning d.id into claimed_id;

  if claimed_id is null then
    raise exception 'This account cannot claim that dealer.' using errcode = '42501';
  end if;

  return claimed_id;
end;
$$;

revoke execute on function public.claim_dealer(uuid) from public;
grant execute on function public.claim_dealer(uuid) to authenticated;

-- Claimed shops must still see listings they removed from the public catalogue.
drop policy "approved listings are readable when signed in" on public.listings;
create policy "approved or owned listings are readable"
on public.listings for select to authenticated
using (
  imported_by = (select auth.uid())
  or exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (
        d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
        or (status = 'active' and d.permission = 'approved')
      )
  )
);

-- The old ALL policy let any account attach its own row to an approved shop.
-- Split the operations so only the importer or shop owner can write, and nobody
-- can physically delete history used by Saved and inquiries.
drop policy "importers write their own listings" on public.listings;

create policy "dealer owners insert listings"
on public.listings for insert to authenticated
with check (
  imported_by = (select auth.uid())
  and exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (
        d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
      )
  )
);

create policy "dealer owners update listings"
on public.listings for update to authenticated
using (
  imported_by = (select auth.uid())
  or exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (
        d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
      )
  )
)
with check (
  imported_by = (select auth.uid())
  or exists (
    select 1
    from public.dealers d
    where d.id = dealer_id
      and (
        d.claimed_by = (select auth.uid())
        or d.created_by = (select auth.uid())
      )
  )
);
