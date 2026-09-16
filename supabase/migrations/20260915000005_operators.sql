-- Operator powers have been a shared key, not an identity. Anything holding
-- SUPABASE_SERVICE_ROLE_KEY could approve a shop, and nothing recorded who did.
-- That was tolerable while the only operator tool was a terminal script on one
-- laptop. It stops being tolerable the moment a browser is involved: the same
-- key also reads every buyer's saved list and deletes any listing, so it can
-- never ship to a client.
--
-- So an operator becomes a row. The functions below authorise on that row
-- instead of on a secret, which makes operator access revocable per person and
-- gives dealer_applications.reviewed_by someone to point at.

create table public.operators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Who this is, in an operator's own words. There is no admin UI for the
  -- operator list itself; it is small enough to read.
  note text,
  added_at timestamptz not null default now()
);

-- No policy at all, so the table is unreachable over REST even for an operator.
-- is_operator() answers the only question any caller needs, and a list of who
-- can approve shops is not something to hand out.
alter table public.operators enable row level security;
revoke all on public.operators from anon, authenticated;

create function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operators o where o.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_operator() from public;
grant execute on function public.is_operator() to authenticated, service_role;

/**
 * The one authorisation rule for every operator action.
 *
 * A caller with no subject is the service key. That key already bypasses RLS on
 * every table in the project, so there is nothing left for this check to
 * protect — refusing it would only break the terminal tools while protecting
 * nothing. anon cannot reach any of these functions: they are never granted to
 * it. So a null subject here means service_role and nothing else.
 */
create function public.require_operator()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return; end if;

  if not public.is_operator() then
    raise exception 'Operators only.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_operator() from public;
grant execute on function public.require_operator() to authenticated, service_role;

-- Now that operators are identities, there is somebody to record.
alter table public.dealer_applications add column reviewed_by uuid references public.profiles (id) on delete set null;

create policy "operators read every application"
on public.dealer_applications for select to authenticated
using (public.is_operator());

/**
 * Every shop, as an operator needs to see it.
 *
 * A function and not a table read. 20260912000007 took `select` on
 * public.dealers away from authenticated and granted it back column by column,
 * leaving contact_email out: RLS filters rows and cannot hide a column, so the
 * grant is the only thing keeping a shop's address off a buyer's client. Giving
 * that column back to `authenticated` to make a review screen work would hand
 * every dealer's mailbox to every buyer.
 *
 * Counts come from here too, rather than from a PostgREST embed. Listings of a
 * pending shop are readable by its importer and nobody else, so an operator
 * counting them through the API would read zero and the screen would claim a
 * shop asking to be published has nothing to publish.
 */
create function public.operator_dealers()
returns table (
  id uuid,
  name text,
  website text,
  contact_email text,
  permission public.dealer_permission,
  claimed_by uuid,
  created_at timestamptz,
  listings_total bigint,
  listings_live bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    select
      d.id,
      d.name,
      d.website,
      d.contact_email,
      d.permission,
      d.claimed_by,
      d.created_at,
      count(l.id),
      -- What is actually in the deck, which is the number the approve and
      -- revoke decision turns on. A shop can hold a hundred rows and show none.
      count(l.id) filter (where l.status = 'active' and l.sold_at is null)
    from public.dealers d
    left join public.listings l on l.dealer_id = d.id
    group by d.id
    order by d.created_at desc;
end;
$$;

revoke execute on function public.operator_dealers() from public;
grant execute on function public.operator_dealers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-grant the operator functions from the key to the role
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: the operator is known from the session now, so
-- p_created_by stops being required and a parameter default cannot be added in
-- place.
drop function public.approve_dealer_application(uuid, uuid, public.dealer_permission);

/**
 * Turns a verified application into a shop the applicant owns.
 *
 * See 20260915000004 for why this is one function and not two writes, and for
 * why permission defaults to approved.
 */
create function public.approve_dealer_application(
  p_application_id uuid,
  p_permission public.dealer_permission default 'approved',
  -- Only the terminal tool passes this. A service-key call has no subject, so
  -- there is no session to attribute the new shop row to.
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.dealer_applications;
  actor uuid := coalesce((select auth.uid()), p_created_by);
  target uuid;
  claimant uuid;
begin
  perform public.require_operator();

  if actor is null then
    raise exception 'Who is approving this? Pass p_created_by.' using errcode = '22023';
  end if;

  select * into app
  from public.dealer_applications a
  where a.id = p_application_id
  for update;

  if app.id is null then
    raise exception 'No such application.' using errcode = 'P0002';
  end if;
  if app.status <> 'pending' then
    raise exception 'That application has already been answered.' using errcode = '42501';
  end if;
  if app.verified_at is null then
    raise exception 'That application has not proved a mailbox yet.' using errcode = '42501';
  end if;

  select d.id, d.claimed_by into target, claimant
  from public.dealers d
  where public.dealer_claim_host(d.website)
      = public.dealer_claim_host(app.website)
  limit 1;

  if target is null then
    insert into public.dealers
      (name, website, contact_email, permission, claimed_by, created_by)
    values (
      app.shop_name,
      app.website,
      app.verified_email,
      p_permission,
      app.user_id,
      actor
    )
    returning id into target;
  else
    if claimant is not null and claimant <> app.user_id then
      raise exception 'Another account already claimed that shop.' using errcode = '42501';
    end if;

    update public.dealers d
    set claimed_by = app.user_id,
        contact_email = coalesce(d.contact_email, app.verified_email),
        permission = p_permission
    where d.id = target;
  end if;

  update public.dealer_applications a
  set status = 'approved',
      dealer_id = target,
      reviewed_at = now(),
      reviewed_by = actor
  where a.id = p_application_id;

  return target;
end;
$$;

revoke execute on function
  public.approve_dealer_application(uuid, public.dealer_permission, uuid) from public;
grant execute on function
  public.approve_dealer_application(uuid, public.dealer_permission, uuid)
  to authenticated, service_role;

drop function public.decline_dealer_application(uuid, text);

/**
 * Says no, in words the applicant reads on their own profile. The note is
 * required: a decline with no reason is the dead end this whole set of
 * migrations exists to remove.
 */
create function public.decline_dealer_application(
  p_application_id uuid,
  p_note text,
  p_reviewed_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce((select auth.uid()), p_reviewed_by);
begin
  perform public.require_operator();

  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say why. The applicant reads this.' using errcode = '22023';
  end if;

  update public.dealer_applications a
  set status = 'declined',
      note = trim(p_note),
      reviewed_at = now(),
      reviewed_by = actor
  where a.id = p_application_id
    and a.status = 'pending';

  if not found then
    raise exception 'No pending application with that id.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.decline_dealer_application(uuid, text, uuid) from public;
grant execute on function public.decline_dealer_application(uuid, text, uuid)
  to authenticated, service_role;

/**
 * Publishing, and pulling back.
 *
 * A function rather than an RLS policy on dealers.permission, because the
 * terminal tool and the operator UI both need exactly this one write and a
 * policy broad enough to allow it would also allow renaming and re-pointing the
 * shop. This is the only implementation of "make a shop live" either caller
 * uses.
 */
create function public.set_dealer_permission(
  p_dealer_id uuid,
  p_permission public.dealer_permission
)
returns public.dealer_permission
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.dealer_permission;
begin
  perform public.require_operator();

  update public.dealers d
  set permission = p_permission
  where d.id = p_dealer_id
  returning d.permission into result;

  if result is null then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;

  return result;
end;
$$;

revoke execute on function
  public.set_dealer_permission(uuid, public.dealer_permission) from public;
grant execute on function
  public.set_dealer_permission(uuid, public.dealer_permission)
  to authenticated, service_role;
