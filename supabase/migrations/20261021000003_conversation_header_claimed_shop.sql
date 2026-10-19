-- Shop owner must see the buyer on the thread header, not an empty party row.

drop function public.conversation_header(uuid);

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
    nullif(btrim(c.title), ''),
    c.dealer_id
  from public.conversations c
  cross join me
  left join public.dealers d on d.id = c.dealer_id
  left join public.profiles other
    on not c.is_group
   and other.id = case
      when c.partner_id is not null then (case when c.opener_id = me.uid then c.partner_id else c.opener_id end)
      when c.dealer_id is not null and d.claimed_by = me.uid then c.opener_id
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
