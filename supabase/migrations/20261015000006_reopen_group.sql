-- Opening a group that already exists has to find it before it checks that
-- every other person still has a username. The person who created it may
-- not have one, and they are already in the set.

create or replace function public.create_group(p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cleaned uuid[];
  everyone uuid[];
  key text;
  found uuid;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;

  select coalesce(array_agg(distinct member_id), '{}'::uuid[])
  into cleaned
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as member_id
  where member_id is not null
    and member_id <> uid;

  if coalesce(array_length(cleaned, 1), 0) < 2 then
    raise exception 'Choose at least two other people.';
  end if;

  if array_length(cleaned, 1) > 12 then
    raise exception 'A group holds at most 12 other people.';
  end if;

  everyone := array_append(cleaned, uid);

  select string_agg(member_id::text, ',' order by member_id::text)
  into key
  from unnest(everyone) as member_id;

  select c.id into found
  from public.conversations c
  where c.members_key = key;

  if found is not null then
    return found;
  end if;

  if (
    select count(*)
    from public.profiles p
    where p.id = any (cleaned)
      and p.handle is not null
  ) <> array_length(cleaned, 1) then
    raise exception 'That account is gone.';
  end if;

  insert into public.conversations (opener_id, is_group, members_key)
  values (uid, true, key)
  returning id into found;

  insert into public.conversation_members (conversation_id, user_id)
  select found, member_id
  from unnest(everyone) as member_id;

  return found;

exception when unique_violation then
  -- Two people created this set at once. One insert won; the other reads it.
  select c.id into found
  from public.conversations c
  where c.members_key = key;
  return found;
end;
$$;
