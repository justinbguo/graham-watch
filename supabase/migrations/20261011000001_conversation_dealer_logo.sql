-- A shop's row in Messages showed a storefront because these functions
-- returned the name and not the icon. logo_url is the favicon the importer
-- read off the shop's own site. The shop's side of the thread still sees the
-- buyer, so the icon follows the same case as the name.

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
  unread bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select
    c.id,
    -- A shop only looks like a shop to the buyer. To the shop, the thread is
    -- with the person who wrote in.
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
    )
  from public.conversations c
  cross join me
  left join public.dealers d on d.id = c.dealer_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = me.uid
  left join public.profiles other
    on other.id = case
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
  where me.uid in (c.opener_id, c.partner_id, d.claimed_by)
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
  writable boolean
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
    c.dealer_id is null or d.claimed_by is not null
  from public.conversations c
  cross join me
  left join public.dealers d on d.id = c.dealer_id
  left join public.profiles other
    on other.id = case
      when c.partner_id is not null then (case when c.opener_id = me.uid then c.partner_id else c.opener_id end)
      when c.opener_id <> me.uid then c.opener_id
    end
  where c.id = p_conversation_id
    and me.uid in (c.opener_id, c.partner_id, d.claimed_by);
$$;

revoke all on function public.conversation_header(uuid) from public, anon;
grant execute on function public.conversation_header(uuid) to authenticated;
