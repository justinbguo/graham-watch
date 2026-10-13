-- Dealers were only ever imported. A shop that found Graham on its own had no
-- door: lookup_claimable_dealer returned nothing and the claim screen told them
-- to ask us to add it, with no way to ask.
--
-- So sign-up forks. A dealer says which site they sell from; if we already hold
-- that shop they claim it, and if we do not they apply. An application is a
-- request an operator answers, never a grant.

-- Which door the account came through. Routing only, and deliberately not a
-- permission: it is self-declared at sign-up, so it proves nothing. Every
-- dealer power still comes from dealers.claimed_by. Granting anything on this
-- column would be a second, weaker claim path beside the one that demands a
-- mailbox.
create type public.account_type as enum ('buyer', 'dealer');

alter table public.profiles add column account_type public.account_type;

create type public.application_status as enum ('pending', 'approved', 'declined');

-- A range, not a count. A dealer asked how many watches they list is
-- estimating, and a bucket is the honest shape of an estimate — the same reason
-- the importer returns null rather than a guess.
create type public.listing_volume as enum ('under_10', '10_to_50', '50_to_200', 'over_200');

create table public.dealer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  shop_name text not null,
  website text not null,
  -- What they sell, as they say it. Free text on purpose: the brand facets are
  -- built from listings already in the catalogue, so a shop we have never read
  -- could not find its own brands in that list. Never confused with
  -- profiles.favorite_brands, which ranks a buyer's deck.
  brands text[] not null default '{}',
  volume public.listing_volume not null,
  status public.application_status not null default 'pending',
  -- The mailbox they proved, on the domain they applied with. Null until the
  -- code is spent, and an operator has nothing to approve before then.
  verified_email text,
  verified_at timestamptz,
  -- Filled when an operator turns an approved application into a real shop.
  dealer_id uuid references public.dealers (id) on delete set null,
  -- The operator's own words on why this was approved or declined.
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index dealer_applications_review_idx
  on public.dealer_applications (status, created_at desc);

-- One live application per account. A decline is final for that attempt but not
-- for the account, so reapplying is allowed once the first is answered.
create unique index dealer_applications_one_live_idx
  on public.dealer_applications (user_id)
  where status = 'pending';

alter table public.dealer_applications enable row level security;

create policy "applicants read their own application"
on public.dealer_applications for select to authenticated
using (user_id = (select auth.uid()));

-- Every column an operator or a proof writes is pinned to its starting value.
-- Without that this policy would let an applicant insert themselves a verified,
-- approved application already pointing at somebody else's shop.
create policy "applicants file their own application"
on public.dealer_applications for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and verified_email is null
  and verified_at is null
  and dealer_id is null
  and note is null
  and reviewed_at is null
);

-- No update and no delete policy, so neither is reachable. Status is an
-- operator decision and verification is a proof; both are written by the
-- definer functions below. The revoke says so out loud, because a policy added
-- later would otherwise silently become writable.
revoke update, delete on public.dealer_applications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- One code implementation, two things to prove
-- ---------------------------------------------------------------------------

-- Hashing lived inline in store_dealer_claim_code and claim_dealer_with_code.
-- Applications need the same construction, and three copies of the one thing
-- standing between a stranger and a shop's inventory is three chances to drift.
create function public.claim_code_digest(p_salt uuid, p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$ select extensions.digest(p_salt::text || p_code, 'sha256'); $$;

-- A code now proves either a shop or an application, never both and never
-- neither. The table keeps its no-policy RLS and its service-role-only writes.
alter table public.dealer_claim_codes
  alter column dealer_id drop not null,
  add column application_id uuid references public.dealer_applications (id) on delete cascade,
  add constraint dealer_claim_codes_one_target
    check ((dealer_id is null) <> (application_id is null));

create index dealer_claim_codes_application_idx
  on public.dealer_claim_codes (application_id, requested_by, created_at desc)
  where consumed_at is null;

/**
 * Whether this address may receive a code for this application.
 *
 * One rule, and it is narrower than the dealer version: a mailbox on the exact
 * host the applicant typed. There is no published contact address to fall back
 * on, because we have never read this shop.
 *
 * The applicant chose the domain, so this proves only that they control the
 * site they claim to sell from. Whether that site is a watch shop is the
 * operator's call, which is why approval is a second gate and not this one.
 */
create function public.can_verify_application(p_application_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dealer_applications a
    where a.id = p_application_id
      and a.status = 'pending'
      and a.verified_at is null
      and public.dealer_claim_host(a.website) is not null
      and public.dealer_claim_host(a.website) =
          lower(split_part(trim(p_email), '@', 2))
  );
$$;

revoke execute on function public.can_verify_application(uuid, text) from public;
grant execute on function public.can_verify_application(uuid, text)
  to authenticated, service_role;

/**
 * Records a code the edge function is about to email. service_role only, for
 * the same reason as store_dealer_claim_code: a caller who could write a code
 * of their choosing could spend it.
 */
create function public.store_application_claim_code(
  p_application_id uuid,
  p_requested_by uuid,
  p_email text,
  p_code text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits record;
  live integer;
  expires timestamptz;
  salt uuid := gen_random_uuid();
begin
  select * into limits from public.claim_code_limits();

  -- The application has to be the caller's own. Checked here rather than in the
  -- edge function so the rule sits next to the data it protects.
  if not exists (
    select 1
    from public.dealer_applications a
    where a.id = p_application_id
      and a.user_id = p_requested_by
  ) then
    raise exception 'That is not your application.' using errcode = '42501';
  end if;

  if not public.can_verify_application(p_application_id, p_email) then
    raise exception 'That address is not on the site you applied with.'
      using errcode = '42501';
  end if;

  select count(*) into live
  from public.dealer_claim_codes c
  where c.application_id = p_application_id
    and c.requested_by = p_requested_by
    and c.consumed_at is null
    and c.expires_at > now();

  if live >= limits.max_live then
    raise exception 'Too many codes requested. Wait for the last one to expire.'
      using errcode = '53400';
  end if;

  expires := now() + limits.ttl;

  insert into public.dealer_claim_codes
    (application_id, requested_by, email, code_hash, salt, expires_at)
  values (
    p_application_id,
    p_requested_by,
    lower(trim(p_email)),
    public.claim_code_digest(salt, p_code),
    salt,
    expires
  );

  return expires;
end;
$$;

revoke execute on function
  public.store_application_claim_code(uuid, uuid, text, text) from public, authenticated;
grant execute on function
  public.store_application_claim_code(uuid, uuid, text, text) to service_role;

/**
 * Spends a code and stamps the proved mailbox on the application.
 *
 * Grants nothing. A verified application is one an operator may now act on —
 * it is not a shop, and there is no dealers row yet to own. That is the whole
 * ordering: prove the mailbox, then a human decides.
 *
 * Returns null for a wrong code rather than raising, for the same reason as
 * claim_dealer_with_code: PostgREST runs each request in its own transaction,
 * so raising would roll back the attempt counter and make guessing free.
 */
create function public.verify_application_email(p_application_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  limits record;
  candidate public.dealer_claim_codes;
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into limits from public.claim_code_limits();

  update public.dealer_claim_codes c
  set attempts = c.attempts + 1
  where c.application_id = p_application_id
    and c.requested_by = actor
    and c.consumed_at is null
    and c.expires_at > now()
    and c.attempts < limits.max_attempts
  returning c.* into candidate;

  if candidate.id is null then
    raise exception 'That code has expired. Ask for a new one.' using errcode = '42501';
  end if;

  if candidate.code_hash
     is distinct from public.claim_code_digest(candidate.salt, p_code) then
    return null;
  end if;

  update public.dealer_applications a
  set verified_email = candidate.email,
      verified_at = now()
  where a.id = p_application_id
    and a.user_id = actor
    -- Re-checked, not only at request time: an application answered while this
    -- code sat in an inbox must not accept a proof afterwards.
    and a.status = 'pending'
    and a.verified_at is null;

  if not found then
    raise exception 'That application has already been answered.' using errcode = '42501';
  end if;

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.application_id = p_application_id
    and c.consumed_at is null;

  return candidate.email;
end;
$$;

revoke execute on function public.verify_application_email(uuid, text) from public;
grant execute on function public.verify_application_email(uuid, text) to authenticated;
