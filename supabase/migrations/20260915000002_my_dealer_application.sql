/**
 * The applicant's own application, newest first, with the host they must prove.
 *
 * The host comes back derived rather than parsed in the client. Deriving it in
 * TypeScript would be a second implementation of dealer_claim_host, and the two
 * disagreeing is a verification screen that offers a mailbox the database will
 * then refuse.
 *
 * security invoker: the select policy already scopes this to the owner, and the
 * supabase rule is invoker unless there is a reason for definer.
 */
create function public.my_dealer_application()
returns table (
  id uuid,
  shop_name text,
  website text,
  claim_host text,
  brands text[],
  volume public.listing_volume,
  status public.application_status,
  verified_email text,
  verified_at timestamptz,
  dealer_id uuid,
  note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.shop_name,
    a.website,
    public.dealer_claim_host(a.website),
    a.brands,
    a.volume,
    a.status,
    a.verified_email,
    a.verified_at,
    a.dealer_id,
    a.note,
    a.created_at,
    a.reviewed_at
  from public.dealer_applications a
  where a.user_id = (select auth.uid())
  order by a.created_at desc
  limit 1;
$$;

revoke execute on function public.my_dealer_application() from public;
grant execute on function public.my_dealer_application() to authenticated;
