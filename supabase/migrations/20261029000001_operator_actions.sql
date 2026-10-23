-- Who did what from the operator console.
--
-- Approve, pause, and delete already check the operators table, and then
-- forget who called. A row here is the memory: the operator, the verb, the
-- row they touched, and the values before and after. Service-role calls have
-- no session, so operator_id is null for those and the log still exists.
--
-- No policies. The table is not a PostgREST resource. operator_activity() is
-- the only read, and it checks the operators table first.

create table public.operator_actions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index operator_actions_created_idx
  on public.operator_actions (created_at desc);

alter table public.operator_actions enable row level security;

revoke all on table public.operator_actions from public, anon, authenticated, service_role;

comment on table public.operator_actions is
  'One row per operator write. Written by security-definer functions; read through operator_activity().';

-- Not granted to anyone. The functions below are the owner, so they can call
-- it; a signed-in operator cannot insert a flattering row of their own.
create function public.record_operator_action(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.operator_actions (operator_id, action, target_type, target_id, before, after)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, p_before, p_after);
end;
$$;

revoke all on function public.record_operator_action(text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.operator_activity(p_limit integer default 80)
returns table (
  id uuid,
  operator_id uuid,
  operator_label text,
  action text,
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 80), 1), 200);
begin
  perform public.require_operator();

  return query
    select
      a.id,
      a.operator_id,
      coalesce(
        nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
        pr.handle,
        'service role'
      ),
      a.action,
      a.target_type,
      a.target_id,
      a.before,
      a.after,
      a.created_at
    from public.operator_actions a
    left join public.profiles pr on pr.id = a.operator_id
    order by a.created_at desc
    limit lim;
end;
$$;

revoke all on function public.operator_activity(integer) from public, anon;
grant execute on function public.operator_activity(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Existing writes, now recorded
-- ---------------------------------------------------------------------------

create or replace function public.set_dealer_permission(
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
  current public.dealer_permission;
  verb text;
begin
  perform public.require_operator();

  select d.permission into current
  from public.dealers d
  where d.id = p_dealer_id;

  if current is null then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;

  -- Pending and revoked shops are already out of the deck. Pausing them
  -- would make Resume look like it publishes a shop that was never approved.
  if p_permission = 'paused' and current is distinct from 'approved' then
    raise exception 'Only a published shop can be paused.' using errcode = '22023';
  end if;

  update public.dealers d
  set permission = p_permission
  where d.id = p_dealer_id
  returning d.permission into result;

  verb := case
    when p_permission = 'paused' then 'pause_shop'
    when p_permission = 'revoked' then 'revoke_shop'
    when p_permission = 'approved' and current = 'paused' then 'resume_shop'
    when p_permission = 'approved' then 'approve_shop'
    else 'set_shop_permission'
  end;

  perform public.record_operator_action(
    verb,
    'shop',
    p_dealer_id,
    jsonb_build_object('permission', current),
    jsonb_build_object('permission', result)
  );

  return result;
end;
$$;

create or replace function public.approve_dealer_application(
  p_application_id uuid,
  p_permission public.dealer_permission default 'approved',
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

  perform public.record_operator_action(
    'approve_application',
    'application',
    p_application_id,
    jsonb_build_object('status', 'pending', 'shop_name', app.shop_name, 'user_id', app.user_id),
    jsonb_build_object('status', 'approved', 'dealer_id', target, 'permission', p_permission)
  );

  return target;
end;
$$;

create or replace function public.decline_dealer_application(
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
  v_note text := trim(p_note);
begin
  perform public.require_operator();

  if coalesce(v_note, '') = '' then
    raise exception 'Say why. The applicant reads this.' using errcode = '22023';
  end if;

  update public.dealer_applications a
  set status = 'declined',
      note = v_note,
      reviewed_at = now(),
      reviewed_by = actor
  where a.id = p_application_id
    and a.status = 'pending';

  if not found then
    raise exception 'No pending application with that id.' using errcode = 'P0002';
  end if;

  perform public.record_operator_action(
    'decline_application',
    'application',
    p_application_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'declined', 'note', v_note)
  );
end;
$$;

create or replace function public.operator_delete_listing(p_listing_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
  item uuid;
  snapshot jsonb;
begin
  perform public.require_operator();

  select to_jsonb(l) into snapshot
  from public.listings l
  where l.id = p_listing_id;

  select array_remove(array_agg(p.storage_path), null)
    into paths
  from public.listing_photos p
  where p.listing_id = p_listing_id;

  -- Read before the delete: the foreign key nulls this the moment the listing
  -- goes, and then there is nothing left to point back at the catalogue row.
  select s.id into item
  from public.source_items s
  where s.listing_id = p_listing_id;

  delete from public.listings where id = p_listing_id;

  if not found then
    raise exception 'No such watch.';
  end if;

  if item is not null then
    update public.source_items
    set publish = false,
        applied_hash = null,
        photos_hash = null,
        error = null
    where id = item;
  end if;

  perform public.record_operator_action(
    'delete_listing',
    'listing',
    p_listing_id,
    snapshot,
    null
  );

  return coalesce(paths, array[]::text[]);
end;
$$;
