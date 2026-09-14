-- Claiming a shop matched the signed-in address against the address the shop
-- publishes on its own site. That is only proof if the address was proven.
--
-- It was not. GoTrue stamps email_confirmed_at at signup when confirmations are
-- off, so posting to /auth/v1/signup as info@someshop.com — an address printed
-- on the shop's contact page — produced a confirmed session and took the shop:
-- every listing editable, the catalogue readable, the inquiries visible.
--
-- config.toml now turns confirmations on. This is the half that does not depend
-- on a setting: a hosted project has its own dashboard toggle, and a claim must
-- not quietly become unauthenticated because somebody flipped it.
create or replace function public.dealer_accounts()
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
  select
    d.id,
    d.name,
    d.website,
    d.permission,
    coalesce(d.claimed_by = (select auth.uid()), false)
  from public.dealers d
  join auth.users u on u.id = (select auth.uid())
  where d.claimed_by = (select auth.uid())
     or (
       d.claimed_by is null
       and d.contact_email is not null
       and u.email_confirmed_at is not null
       and lower(trim(d.contact_email)) = lower(trim(u.email))
     )
  order by d.name;
$$;

revoke execute on function public.dealer_accounts() from public;
grant execute on function public.dealer_accounts() to authenticated;

create or replace function public.claim_dealer(p_dealer_id uuid)
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
        -- The whole security boundary of this fast path. Without it the match
        -- below compares against an address nobody ever received mail at.
        and u.email_confirmed_at is not null
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
