-- A group is several people in one thread. A direct chat still stores its
-- other side in a column: one column cannot hold a list, and the shop-claim
-- rule reads that column. Group members live in their own table. The same
-- set of people is one group, so opening it again returns the one that exists.

alter table public.conversations
  add column is_group boolean not null default false,
  add column members_key text;

alter table public.conversations drop constraint conversations_one_other;

alter table public.conversations add constraint conversations_sides check (
  (
    not is_group
    and members_key is null
    and (partner_id is null) <> (dealer_id is null)
  )
  or (
    is_group
    and partner_id is null
    and dealer_id is null
    and members_key is not null
  )
);

create unique index conversations_group_key_idx
  on public.conversations (members_key)
  where members_key is not null;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx
  on public.conversation_members (user_id, conversation_id);

alter table public.conversation_members enable row level security;

-- The opener column would otherwise delete the group for everyone left in it
-- when the person who created it deletes their account. Hand the row to the
-- member who has been in it longest. Their own messages still leave with them.
create function public.keep_group_when_opener_leaves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
  set opener_id = next.user_id
  from (
    select distinct on (m.conversation_id) m.conversation_id, m.user_id
    from public.conversation_members m
    where m.user_id <> old.id
      and m.conversation_id in (
        select g.id
        from public.conversations g
        where g.is_group and g.opener_id = old.id
      )
    order by m.conversation_id, m.joined_at
  ) next
  where c.id = next.conversation_id;

  return old;
end;
$$;

create trigger profiles_keep_groups
before delete on public.profiles
for each row
execute function public.keep_group_when_opener_leaves();

revoke all on function public.keep_group_when_opener_leaves() from public, anon, authenticated;

create or replace function public.in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_conversation_id
      and (
        (select auth.uid()) in (c.opener_id, c.partner_id, d.claimed_by)
        or exists (
          select 1
          from public.conversation_members m
          where m.conversation_id = c.id
            and m.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.conversation_writable(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_conversation_id
      and (
        (select auth.uid()) in (c.opener_id, c.partner_id, d.claimed_by)
        or exists (
          select 1
          from public.conversation_members m
          where m.conversation_id = c.id
            and m.user_id = (select auth.uid())
        )
      )
      and (c.dealer_id is null or d.claimed_by is not null)
  );
$$;

-- A group is created by create_group, which writes the members in the same
-- step. A client insert would be a thread with nobody in it.
drop policy "you open a conversation as yourself" on public.conversations;

create policy "you open a conversation as yourself"
on public.conversations for insert to authenticated
with check (
  opener_id = (select auth.uid())
  and not is_group
);

create policy "you read members of your conversations"
on public.conversation_members for select to authenticated
using (public.in_conversation(conversation_id));

revoke all on public.conversation_members from anon, public, authenticated;
grant select on public.conversation_members to authenticated;

/**
 * Open a group with these people, or the one that already has exactly this
 * set. Two is the minimum besides you: one other person is a direct thread.
 * Twelve is the most.
 */
create function public.create_group(p_member_ids uuid[])
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

  if (
    select count(*)
    from public.profiles p
    where p.id = any (cleaned)
      and p.handle is not null
  ) <> array_length(cleaned, 1) then
    raise exception 'That account is gone.';
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

revoke all on function public.create_group(uuid[]) from public, anon;
grant execute on function public.create_group(uuid[]) to authenticated;

-- People you share a group with belong in the empty-field suggestions, with
-- the people you already have a direct thread with.
create or replace function public.suggest_people(p_query text)
returns table (
  id uuid,
  handle text,
  name text,
  avatar_url text,
  collector_number integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cleaned text;
  prefix text;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;

  cleaned := lower(btrim(coalesce(p_query, '')));
  if left(cleaned, 1) = '@' then
    cleaned := substr(cleaned, 2);
  end if;

  if length(cleaned) > 40 then
    return;
  end if;

  if cleaned = '' then
    return query
    select
      p.id,
      p.handle,
      nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      p.avatar_url,
      p.collector_number
    from public.profiles p
    left join lateral (
      select max(c.last_message_at) as at
      from public.conversations c
      left join public.dealers d on d.id = c.dealer_id
      where (c.opener_id = uid and (c.partner_id = p.id or d.claimed_by = p.id))
         or (c.partner_id = uid and c.opener_id = p.id)
         or (d.claimed_by = uid and c.opener_id = p.id)
         or exists (
           select 1
           from public.conversation_members mine
           join public.conversation_members theirs
             on theirs.conversation_id = mine.conversation_id
            and theirs.user_id = p.id
           where mine.user_id = uid
             and mine.conversation_id = c.id
         )
    ) talked on true
    where p.handle is not null
      and p.id <> uid
    order by talked.at desc nulls last, p.collector_number
    limit 8;
    return;
  end if;

  prefix := cleaned;
  if prefix !~ '^[a-z0-9_]+$' then
    prefix := '';
  end if;

  return query
  select
    p.id,
    p.handle,
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.avatar_url,
    p.collector_number
  from public.profiles p
  where p.handle is not null
    and p.id <> uid
    and (
      (prefix <> '' and starts_with(p.handle, prefix))
      or starts_with(lower(coalesce(p.first_name, '')), cleaned)
      or starts_with(lower(coalesce(p.last_name, '')), cleaned)
      or starts_with(
        lower(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))),
        cleaned
      )
    )
  order by
    case
      when prefix <> '' and p.handle = prefix then 0
      when prefix <> '' and starts_with(p.handle, prefix) then 1
      else 2
    end,
    p.handle
  limit 8;
end;
$$;

drop function public.conversation_list();

create function public.conversation_list()
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
    case when c.is_group then (
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

drop function public.conversation_header(uuid);

create function public.conversation_header(p_conversation_id uuid)
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
    case when c.is_group then (
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
