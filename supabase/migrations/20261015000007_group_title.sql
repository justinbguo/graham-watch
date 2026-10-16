-- A group may carry a name. The client cannot update conversations, so
-- create_group is the only writer. The same people still open the same
-- group. A name fills in only when that group has none.

alter table public.conversations
  add column title text;

alter table public.conversations
  add constraint conversations_group_title check (
    title is null
    or (
      is_group
      and char_length(title) between 1 and 40
      and title = btrim(title)
    )
  );

-- The argument list changed, so replace cannot keep the old function.
drop function public.create_group(uuid[]);

create function public.create_group(p_member_ids uuid[], p_title text default null)
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
  cleaned_title text;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;

  cleaned_title := nullif(regexp_replace(btrim(coalesce(p_title, '')), '[[:space:]]+', ' ', 'g'), '');
  if cleaned_title is not null and char_length(cleaned_title) > 40 then
    raise exception 'A group name is at most 40 characters.';
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
    if cleaned_title is not null then
      update public.conversations
      set title = cleaned_title
      where id = found
        and title is null;
    end if;
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

  insert into public.conversations (opener_id, is_group, members_key, title)
  values (uid, true, key, cleaned_title)
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

revoke all on function public.create_group(uuid[], text) from public, anon;
grant execute on function public.create_group(uuid[], text) to authenticated;

create or replace function public.conversation_list()
returns table (
  id uuid,
  dealer_id uuid,
  dealer_name text,
  dealer_logo_url text,
  person_id uuid,
  person_name text,
  person_handle text,
  person_number integer,
  person_avatar_url text,
  by_email boolean,
  last_body text,
  last_at timestamptz,
  last_mine boolean,
  unread bigint,
  is_group boolean,
  group_names text[],
  group_handles text[],
  member_count integer,
  last_sender_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select
    c.id,
    case when c.dealer_id is not null and c.opener_id = me.uid then c.dealer_id end,
    case when c.dealer_id is not null and c.opener_id = me.uid then d.name end,
    case when c.dealer_id is not null and c.opener_id = me.uid then d.logo_url end,
    other.id,
    nullif(btrim(concat_ws(' ', other.first_name, other.last_name)), ''),
    other.handle,
    other.collector_number,
    other.avatar_url,
    c.dealer_id is not null and d.claimed_by is null,
    last.body,
    last.created_at,
    last.sender_id = me.uid,
    (
      select count(*)
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> me.uid
        and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
    ),
    c.is_group,
    case
      when c.is_group and nullif(btrim(c.title), '') is not null then array[btrim(c.title)]
      when c.is_group then (
      select coalesce(array_agg(
        coalesce(
          nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
          case when p.handle is not null then '@' || p.handle end,
          'A collector'
        )
        order by p.handle
      ), '{}'::text[])
      from public.conversation_members mem
      join public.profiles p on p.id = mem.user_id
      where mem.conversation_id = c.id
        and mem.user_id <> me.uid
    ) end,
    case when c.is_group then (
      select coalesce(array_agg(p.handle order by p.handle), '{}'::text[])
      from public.conversation_members mem
      join public.profiles p on p.id = mem.user_id
      where mem.conversation_id = c.id
        and mem.user_id <> me.uid
        and p.handle is not null
    ) end,
    case when c.is_group then (
      select count(*)::integer
      from public.conversation_members mem
      where mem.conversation_id = c.id
    ) else 0 end,
    sender_label.name
  from public.conversations c
  cross join me
  left join public.dealers d on d.id = c.dealer_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = me.uid
  left join public.profiles other
    on not c.is_group
   and other.id = case
      when c.partner_id is not null then (case when c.opener_id = me.uid then c.partner_id else c.opener_id end)
      when c.opener_id <> me.uid then c.opener_id
    end
  left join lateral (
    select m.body, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last on true
  left join lateral (
    select coalesce(
      nullif(btrim(p.first_name), ''),
      case when p.handle is not null then '@' || p.handle end,
      'Someone'
    ) as name
    from public.profiles p
    where c.is_group
      and last.sender_id is distinct from me.uid
      and p.id = last.sender_id
  ) sender_label on true
  where me.uid in (c.opener_id, c.partner_id, d.claimed_by)
     or exists (
       select 1
       from public.conversation_members mem
       where mem.conversation_id = c.id
         and mem.user_id = me.uid
     )
  order by c.last_message_at desc
  limit 200;
$$;

revoke all on function public.conversation_list() from public, anon;
grant execute on function public.conversation_list() to authenticated;

create or replace function public.conversation_header(p_conversation_id uuid)
returns table (
  id uuid,
  dealer_id uuid,
  dealer_name text,
  dealer_logo_url text,
  person_id uuid,
  person_name text,
  person_handle text,
  person_number integer,
  person_avatar_url text,
  by_email boolean,
  writable boolean,
  is_group boolean,
  group_names text[],
  group_handles text[],
  member_count integer,
  members jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select
    c.id,
    case when c.dealer_id is not null and c.opener_id = me.uid then c.dealer_id end,
    case when c.dealer_id is not null and c.opener_id = me.uid then d.name end,
    case when c.dealer_id is not null and c.opener_id = me.uid then d.logo_url end,
    other.id,
    nullif(btrim(concat_ws(' ', other.first_name, other.last_name)), ''),
    other.handle,
    other.collector_number,
    other.avatar_url,
    c.dealer_id is not null and d.claimed_by is null,
    c.dealer_id is null or d.claimed_by is not null,
    c.is_group,
    case
      when c.is_group and nullif(btrim(c.title), '') is not null then array[btrim(c.title)]
      when c.is_group then (
      select coalesce(array_agg(
        coalesce(
          nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
          case when p.handle is not null then '@' || p.handle end,
          'A collector'
        )
        order by p.handle
      ), '{}'::text[])
      from public.conversation_members mem
      join public.profiles p on p.id = mem.user_id
      where mem.conversation_id = c.id
        and mem.user_id <> me.uid
    ) end,
    case when c.is_group then (
      select coalesce(array_agg(p.handle order by p.handle), '{}'::text[])
      from public.conversation_members mem
      join public.profiles p on p.id = mem.user_id
      where mem.conversation_id = c.id
        and mem.user_id <> me.uid
        and p.handle is not null
    ) end,
    case when c.is_group then (
      select count(*)::integer
      from public.conversation_members mem
      where mem.conversation_id = c.id
    ) else 0 end,
    case when c.is_group then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
        'handle', p.handle,
        'avatar_url', p.avatar_url
      ) order by p.handle), '[]'::jsonb)
      from public.conversation_members mem
      join public.profiles p on p.id = mem.user_id
      where mem.conversation_id = c.id
        and mem.user_id <> me.uid
    ) else '[]'::jsonb end
  from public.conversations c
  cross join me
  left join public.dealers d on d.id = c.dealer_id
  left join public.profiles other
    on not c.is_group
   and other.id = case
      when c.partner_id is not null then (case when c.opener_id = me.uid then c.partner_id else c.opener_id end)
      when c.opener_id <> me.uid then c.opener_id
    end
  where c.id = p_conversation_id
    and (
      me.uid in (c.opener_id, c.partner_id, d.claimed_by)
      or exists (
        select 1
        from public.conversation_members mem
        where mem.conversation_id = c.id
          and mem.user_id = me.uid
      )
    );
$$;

revoke all on function public.conversation_header(uuid) from public, anon;
grant execute on function public.conversation_header(uuid) to authenticated;
