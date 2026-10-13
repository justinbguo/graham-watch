-- Answering an application: the operator half of the door opened in
-- 20260915000001. Both functions are service_role only, for the same reason
-- approving a dealer is impossible from the app — a shop must not be able to
-- publish itself.

/**
 * Turns a verified application into a shop the applicant owns.
 *
 * One function rather than two writes from the script, because a shop created
 * without its application marked answered is a shop an operator would accept
 * twice, and dealers.website is unique so the second attempt fails with a
 * constraint error nobody can read.
 *
 * The mailbox is already proved by now, so claimed_by is set here rather than
 * sending the dealer through the code flow to prove the same address twice.
 *
 * permission defaults to approved because this dealer asked to be listed and
 * proved it was them: that request is the republish consent the column records.
 * Pass 'pending' to accept a shop without letting its listings go live yet.
 */
create function public.approve_dealer_application(
  p_application_id uuid,
  p_created_by uuid,
  p_permission public.dealer_permission default 'approved'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.dealer_applications;
  target uuid;
  claimant uuid;
begin
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

  -- The importer may have read this shop while the application sat waiting.
  -- dealers.website is unique, so inserting would fail on the constraint;
  -- match on host so www and a trailing path do not read as a different shop.
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
      p_created_by
    )
    returning id into target;
  else
    if claimant is not null and claimant <> app.user_id then
      raise exception 'Another account already claimed that shop.' using errcode = '42501';
    end if;

    update public.dealers d
    set claimed_by = app.user_id,
        -- The scraped address is the shop's published sales mailbox. The proved
        -- one might be whichever inbox the applicant happened to control, so it
        -- only fills a gap rather than replacing a working address.
        contact_email = coalesce(d.contact_email, app.verified_email),
        permission = p_permission
    where d.id = target;
  end if;

  update public.dealer_applications a
  set status = 'approved',
      dealer_id = target,
      reviewed_at = now()
  where a.id = p_application_id;

  return target;
end;
$$;

revoke execute on function
  public.approve_dealer_application(uuid, uuid, public.dealer_permission)
  from public, authenticated;
grant execute on function
  public.approve_dealer_application(uuid, uuid, public.dealer_permission)
  to service_role;

/**
 * Says no, in words the applicant reads on their own profile.
 *
 * The note is required. A decline with no reason is the dead end this whole
 * migration set exists to remove.
 */
create function public.decline_dealer_application(p_application_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say why. The applicant reads this.' using errcode = '22023';
  end if;

  update public.dealer_applications a
  set status = 'declined',
      note = trim(p_note),
      reviewed_at = now()
  where a.id = p_application_id
    and a.status = 'pending';

  if not found then
    raise exception 'No pending application with that id.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.decline_dealer_application(uuid, text)
  from public, authenticated;
grant execute on function public.decline_dealer_application(uuid, text) to service_role;
