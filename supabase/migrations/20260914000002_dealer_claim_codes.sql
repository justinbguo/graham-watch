-- Claiming only worked if the shop signed in as the exact address printed on
-- its own contact page. Plenty of dealers publish info@theshop.com and read it
-- from a personal account, or publish a Gmail address entirely. Those shops had
-- no way in at all.
--
-- So: prove control of a mailbox at the shop's own domain, by receiving a code
-- there. The account doing the claiming can be any account — what is proven is
-- the mailbox, not the login.

create extension if not exists pgcrypto with schema extensions;

create table public.dealer_claim_codes (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  -- Who asked. A code is spendable only by the account that requested it, so a
  -- forwarded email cannot hand the shop to whoever opens it.
  requested_by uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  -- Never the code itself. Six digits is a small space, and a table anyone can
  -- restore from a backup should not be a list of live credentials.
  code_hash bytea not null,
  salt uuid not null default gen_random_uuid(),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index dealer_claim_codes_lookup_idx
  on public.dealer_claim_codes (dealer_id, requested_by, created_at desc)
  where consumed_at is null;

alter table public.dealer_claim_codes enable row level security;

-- No policies at all: nothing reaches this table through PostgREST. Codes are
-- written by the edge function under the service role and spent through
-- public.claim_dealer_with_code, which never returns one.
revoke all on public.dealer_claim_codes from anon, authenticated;

-- How many live codes one account may have outstanding for one shop before it
-- has to wait. Stops a request loop from filling a dealer's inbox.
create function public.claim_code_limits()
returns table (max_live integer, ttl interval, max_attempts integer)
language sql
immutable
set search_path = ''
as $$ select 3, interval '15 minutes', 5; $$;

/**
 * The host a claim address must sit on, or null when the shop has no website.
 *
 * Exact host with `www.` stripped, never a parent domain. Taking the
 * registrable domain would read `goldfinger.squarespace.com` as
 * `squarespace.com` and let anyone with an address there claim the shop.
 */
create function public.dealer_claim_host(p_website text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(coalesce(substring(p_website from '^[a-z]+://([^/:]+)'), '')),
      '^www\.',
      ''
    ),
    ''
  );
$$;

/**
 * Whether `p_email` is allowed to receive a claim code for this shop.
 *
 * Two ways to qualify: the address the shop already publishes, or any address
 * at the shop's own domain. The second is what lets a dealer use the mailbox
 * they actually read instead of the one on the contact page.
 */
create function public.can_claim_with_email(p_dealer_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and d.claimed_by is null
      and (
        lower(trim(d.contact_email)) = lower(trim(p_email))
        or (
          public.dealer_claim_host(d.website) is not null
          and public.dealer_claim_host(d.website) =
              lower(split_part(trim(p_email), '@', 2))
        )
      )
  );
$$;

revoke execute on function public.can_claim_with_email(uuid, text) from public;
grant execute on function public.can_claim_with_email(uuid, text) to authenticated, service_role;

/**
 * Records a code the edge function is about to email.
 *
 * service_role only. Granted to `authenticated` this would be the whole attack:
 * a caller could write a code of their choosing and then spend it.
 */
create function public.store_dealer_claim_code(
  p_dealer_id uuid,
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

  if not public.can_claim_with_email(p_dealer_id, p_email) then
    raise exception 'That address cannot claim this shop.' using errcode = '42501';
  end if;

  select count(*) into live
  from public.dealer_claim_codes c
  where c.dealer_id = p_dealer_id
    and c.requested_by = p_requested_by
    and c.consumed_at is null
    and c.expires_at > now();

  if live >= limits.max_live then
    raise exception 'Too many codes requested. Wait for the last one to expire.'
      using errcode = '53400';
  end if;

  expires := now() + limits.ttl;

  insert into public.dealer_claim_codes (dealer_id, requested_by, email, code_hash, salt, expires_at)
  values (
    p_dealer_id,
    p_requested_by,
    lower(trim(p_email)),
    extensions.digest(salt::text || p_code, 'sha256'),
    salt,
    expires
  );

  return expires;
end;
$$;

revoke execute on function public.store_dealer_claim_code(uuid, uuid, text, text) from public, authenticated;
grant execute on function public.store_dealer_claim_code(uuid, uuid, text, text) to service_role;

/**
 * Spends a code and takes ownership.
 *
 * Safe to call straight from the app: it demands the code, and the code only
 * ever existed in an inbox at the shop's own domain. Five wrong guesses burn the
 * code and the next one has to be requested by email again.
 *
 * Returns null for a wrong code rather than raising. PostgREST runs each request
 * in its own transaction, so raising here would roll back the attempt counter
 * and make guessing free — six digits is a million tries.
 */
create function public.claim_dealer_with_code(p_dealer_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  limits record;
  candidate public.dealer_claim_codes;
  claimed_id uuid;
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into limits from public.claim_code_limits();

  update public.dealer_claim_codes c
  set attempts = c.attempts + 1
  where c.dealer_id = p_dealer_id
    and c.requested_by = actor
    and c.consumed_at is null
    and c.expires_at > now()
    and c.attempts < limits.max_attempts
  returning c.* into candidate;

  if candidate.id is null then
    raise exception 'That code has expired. Ask for a new one.' using errcode = '42501';
  end if;

  if candidate.code_hash is distinct from extensions.digest(candidate.salt::text || p_code, 'sha256') then
    return null;
  end if;

  update public.dealers d
  set claimed_by = actor
  where d.id = p_dealer_id
    -- Re-checked here and not only at request time: a shop claimed while this
    -- code sat in an inbox must not be handed over a second time.
    and d.claimed_by is null
  returning d.id into claimed_id;

  if claimed_id is null then
    raise exception 'That shop has already been claimed.' using errcode = '42501';
  end if;

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.id = candidate.id;

  -- Every other live code for this shop dies with the claim.
  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.dealer_id = p_dealer_id
    and c.consumed_at is null;

  return claimed_id;
end;
$$;

revoke execute on function public.claim_dealer_with_code(uuid, text) from public;
grant execute on function public.claim_dealer_with_code(uuid, text) to authenticated;

/**
 * Finds the shop behind a website a dealer typed, and says how they may prove
 * they run it.
 *
 * The published address comes back masked. A buyer could otherwise read every
 * dealer's contact address out of this function, which is exactly what the
 * column grants in 20260912000007 were added to prevent.
 */
create function public.lookup_claimable_dealer(p_website text)
returns table (
  id uuid,
  name text,
  website text,
  claimed boolean,
  claim_host text,
  contact_hint text
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
    d.claimed_by is not null,
    public.dealer_claim_host(d.website),
    case
      when d.contact_email is null then null
      else left(split_part(d.contact_email, '@', 1), 1) || '•••@' ||
           split_part(d.contact_email, '@', 2)
    end
  from public.dealers d
  where public.dealer_claim_host(d.website) is not null
    and public.dealer_claim_host(d.website) = public.dealer_claim_host(
      case when p_website ~ '^[a-z]+://' then p_website else 'https://' || p_website end
    )
  limit 1;
$$;

revoke execute on function public.lookup_claimable_dealer(text) from public;
grant execute on function public.lookup_claimable_dealer(text) to authenticated;
