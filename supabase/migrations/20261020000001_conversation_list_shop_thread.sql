-- Shop inbox filters on thread_dealer_id (= conversations.dealer_id on shop threads).

drop function public.conversation_list();

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
  group_title text,
  thread_dealer_id uuid
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
    nullif(btrim(c.title), ''),
    c.dealer_id
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
