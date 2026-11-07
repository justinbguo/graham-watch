-- Headless operator calls. A signed-in operator still uses set_dealer_permission.
-- The bot has no session, so these functions are granted only to service_role
-- and the edge function is the thing that checks the secret.
--
-- Supabase grants execute on a new function to authenticated by default.
-- The revokes below are the gate. A dealer must not be able to call them.

alter table public.operator_actions
  add column actor text;

comment on column public.operator_actions.actor is
  'Who wrote the row when auth.uid() is null. operator-bot is the headless secret.';

alter table public.import_jobs
  alter column user_id drop not null;

create function public.record_bot_action(
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
  insert into public.operator_actions (operator_id, actor, action, target_type, target_id, before, after)
  values (null, 'operator-bot', p_action, p_target_type, p_target_id, p_before, p_after);
end;
$$;

revoke all on function public.record_bot_action(text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_bot_action(text, text, uuid, jsonb, jsonb)
  to service_role;

create function public.bot_set_dealer_permission(
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
  if p_permission is distinct from 'approved' and p_permission is distinct from 'pending' then
    raise exception 'Operator bot can approve or unapprove only.' using errcode = '22023';
  end if;

  select d.permission into current
  from public.dealers d
  where d.id = p_dealer_id;

  if current is null then
    raise exception 'No such shop.' using errcode = 'P0002';
  end if;

  if p_permission = 'pending' and current = 'revoked' then
    raise exception 'A revoked shop stays revoked.' using errcode = '22023';
  end if;

  update public.dealers d
  set permission = p_permission
  where d.id = p_dealer_id
  returning d.permission into result;

  verb := case
    when p_permission = 'approved' then 'approve_shop'
    else 'unapprove_shop'
  end;

  insert into public.operator_actions (operator_id, actor, action, target_type, target_id, before, after)
  values (
    null,
    'operator-bot',
    verb,
    'shop',
    p_dealer_id,
    jsonb_build_object('permission', current),
    jsonb_build_object('permission', result)
  );

  return result;
end;
$$;

revoke all on function public.bot_set_dealer_permission(uuid, public.dealer_permission)
  from public, anon, authenticated;
grant execute on function public.bot_set_dealer_permission(uuid, public.dealer_permission)
  to service_role;

create or replace function public.operator_activity(p_limit integer default 80)
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
      case
        when a.actor = 'operator-bot' then 'operator bot'
        else coalesce(
          nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
          pr.handle,
          'service role'
        )
      end,
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
