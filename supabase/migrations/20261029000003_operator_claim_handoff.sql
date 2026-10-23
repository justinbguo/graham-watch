-- An operator can hand a shop to a dealer without the mailbox round trip.
--
-- Mailbox codes stay as they are: hashed, fifteen minutes, spendable only by
-- the account that asked, because the proof is "this inbox received it".
-- A code the operator reads out loud is a different proof. The operator is
-- already trusted to publish the shop. handoff marks that kind of code: any
-- signed-in account may spend it, it lasts seven days so the dealer can sit
-- down later, and five wrong guesses still burn it.
--
-- The plaintext exists only in the return value of operator_issue_claim_code.
-- The table keeps the salted hash, same as a mailed code. Revoke sets
-- consumed_at. Unassign clears claimed_by and burns any live handoff code,
-- so a code already read out cannot be spent after the handoff is cancelled.

alter table public.dealer_claim_codes
  add column handoff boolean not null default false;

comment on column public.dealer_claim_codes.handoff is
  'True when an operator issued the code. Any signed-in account may spend it. Mailbox codes stay false and stay bound to the account that asked.';

create index dealer_claim_codes_handoff_idx
  on public.dealer_claim_codes (dealer_id, created_at desc)
  where handoff and consumed_at is null;

create or replace function public.claim_dealer_with_code(p_dealer_id uuid, p_code text)
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
  handoff_id uuid;
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into limits from public.claim_code_limits();

  -- Mailbox codes only. A handoff code is not bound to requested_by.
  update public.dealer_claim_codes c
  set attempts = c.attempts + 1
  where c.dealer_id = p_dealer_id
    and c.requested_by = actor
    and not c.handoff
    and c.consumed_at is null
    and c.expires_at > now()
    and c.attempts < limits.max_attempts
  returning c.* into candidate;

  if candidate.id is not null then
    if candidate.code_hash is distinct from extensions.digest(candidate.salt::text || p_code, 'sha256') then
      return null;
    end if;
  else
    select c.id into handoff_id
    from public.dealer_claim_codes c
    where c.dealer_id = p_dealer_id
      and c.handoff
      and c.consumed_at is null
      and c.expires_at > now()
      and c.attempts < limits.max_attempts
    order by c.created_at desc
    limit 1;

    if handoff_id is null then
      raise exception 'That code has expired. Ask for a new one.' using errcode = '42501';
    end if;

    update public.dealer_claim_codes c
    set attempts = c.attempts + 1
    where c.id = handoff_id
    returning c.* into candidate;

    if candidate.code_hash is distinct from extensions.digest(candidate.salt::text || p_code, 'sha256') then
      return null;
    end if;
  end if;

  update public.dealers d
  set claimed_by = actor
  where d.id = p_dealer_id
    and d.claimed_by is null
  returning d.id into claimed_id;

  if claimed_id is null then
    raise exception 'That shop has already been claimed.' using errcode = '42501';
  end if;

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.id = candidate.id;

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.dealer_id = p_dealer_id
    and c.consumed_at is null;

  return claimed_id;
end;
$$;

create function public.operator_issue_claim_code(p_dealer_id uuid)
returns table (
  code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  shop public.dealers;
  salt uuid := gen_random_uuid();
  raw bytea := extensions.gen_random_bytes(3);
  digits text;
  expires timestamptz;
  superseded integer;
begin
  perform public.require_operator();

  if actor is null then
    raise exception 'Sign in as an operator to issue a claim code.' using errcode = '42501';
  end if;

  select * into shop from public.dealers d where d.id = p_dealer_id;
  if shop.id is null then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;
  if shop.claimed_by is not null then
    raise exception 'Unassign the current dealer before issuing a claim code.'
      using errcode = '22023';
  end if;

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.dealer_id = p_dealer_id
    and c.handoff
    and c.consumed_at is null;
  get diagnostics superseded = row_count;

  -- Three random bytes, reduced to six digits. Slightly biased, and still a
  -- million-sized space with a five-guess burn, which is the mailbox rule.
  digits := lpad((
    (
      get_byte(raw, 0)::bigint * 65536
      + get_byte(raw, 1)::bigint * 256
      + get_byte(raw, 2)::bigint
    ) % 1000000
  )::text, 6, '0');

  -- Seven days, not the mailbox fifteen minutes. The dealer is not sitting
  -- in the app when the operator copies this.
  expires := now() + interval '7 days';

  insert into public.dealer_claim_codes (
    dealer_id, requested_by, email, code_hash, salt, expires_at, handoff
  )
  values (
    p_dealer_id,
    actor,
    coalesce(nullif(lower(btrim(shop.contact_email)), ''), 'handoff'),
    extensions.digest(salt::text || digits, 'sha256'),
    salt,
    expires,
    true
  );

  perform public.record_operator_action(
    'issue_claim_code',
    'shop',
    p_dealer_id,
    jsonb_build_object('superseded', superseded),
    jsonb_build_object('expires_at', expires, 'handoff', true)
  );

  code := digits;
  expires_at := expires;
  return next;
end;
$$;

revoke all on function public.operator_issue_claim_code(uuid) from public, anon;
grant execute on function public.operator_issue_claim_code(uuid) to authenticated, service_role;

create function public.operator_revoke_claim_code(p_dealer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform public.require_operator();

  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.dealer_id = p_dealer_id
    and c.handoff
    and c.consumed_at is null
    and c.expires_at > now();

  get diagnostics n = row_count;

  if n = 0 then
    raise exception 'No live claim code.' using errcode = 'P0002';
  end if;

  perform public.record_operator_action(
    'revoke_claim_code',
    'shop',
    p_dealer_id,
    jsonb_build_object('live', n),
    jsonb_build_object('live', 0)
  );

  return n;
end;
$$;

revoke all on function public.operator_revoke_claim_code(uuid) from public, anon;
grant execute on function public.operator_revoke_claim_code(uuid) to authenticated, service_role;

create function public.operator_unclaim_shop(p_dealer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous uuid;
  burned integer;
begin
  perform public.require_operator();

  select d.claimed_by into previous
  from public.dealers d
  where d.id = p_dealer_id;

  if not found then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;
  if previous is null then
    raise exception 'That shop is not claimed.' using errcode = '22023';
  end if;

  update public.dealers d
  set claimed_by = null
  where d.id = p_dealer_id;

  -- A code already copied must not survive the cancellation.
  update public.dealer_claim_codes c
  set consumed_at = now()
  where c.dealer_id = p_dealer_id
    and c.handoff
    and c.consumed_at is null;
  get diagnostics burned = row_count;

  perform public.record_operator_action(
    'unclaim_shop',
    'shop',
    p_dealer_id,
    jsonb_build_object('claimed_by', previous),
    jsonb_build_object('claimed_by', null, 'codes_burned', burned)
  );
end;
$$;

revoke all on function public.operator_unclaim_shop(uuid) from public, anon;
grant execute on function public.operator_unclaim_shop(uuid) to authenticated, service_role;
