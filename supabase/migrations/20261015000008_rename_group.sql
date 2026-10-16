-- Renaming is its own write. create_group still will not replace a name
-- a group already has. Any member may change it, including clearing it.

create function public.rename_group(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cleaned text;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.is_group
      and exists (
        select 1
        from public.conversation_members m
        where m.conversation_id = c.id
          and m.user_id = uid
      )
  ) then
    raise exception 'That group is not yours.';
  end if;

  cleaned := nullif(regexp_replace(btrim(coalesce(p_title, '')), '[[:space:]]+', ' ', 'g'), '');
  if cleaned is not null and char_length(cleaned) > 40 then
    raise exception 'A group name is at most 40 characters.';
  end if;

  update public.conversations
  set title = cleaned
  where id = p_conversation_id;
end;
$$;

revoke all on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.rename_group(uuid, text) to authenticated;

-- The list and the header grow a column, so replace cannot keep them.
drop function public.conversation_list();
drop function public.conversation_header(uuid);

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
  last_sender_name text,
  group_title text
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
    sender_label.name,
    nullif(btrim(c.title), '')
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
  members jsonb,
  group_title text
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
    ) else '[]'::jsonb end,
    nullif(btrim(c.title), '')
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
