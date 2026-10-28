-- Read-only messaging for operators. Tables stay behind RLS; these RPCs check
-- require_operator() first.

create function public.operator_conversations(
  p_dealer_id uuid default null,
  p_unanswered_only boolean default false,
  p_limit integer default 80
)
returns table (
  id uuid,
  last_message_at timestamptz,
  is_group boolean,
  shop_id uuid,
  shop_name text,
  buyer_label text,
  buyer_handle text,
  partner_label text,
  partner_handle text,
  message_count bigint,
  unanswered boolean,
  preview text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    with waiting as (
      select c.id as conversation_id
      from public.conversations c
      join public.dealers d on d.id = c.dealer_id
      where c.dealer_id is not null
        and exists (
          select 1
          from public.messages m
          where m.conversation_id = c.id
            and m.created_at < now() - interval '48 hours'
            and m.sender_id is distinct from d.claimed_by
            and not exists (
              select 1
              from public.messages reply
              where reply.conversation_id = c.id
                and d.claimed_by is not null
                and reply.sender_id = d.claimed_by
                and reply.created_at > m.created_at
            )
        )
      union
      select c.id
      from public.conversations c
      where c.partner_id is not null
        and not c.is_group
        and exists (
          select 1
          from public.messages m
          where m.conversation_id = c.id
            and m.created_at < now() - interval '48 hours'
            and m.sender_id = c.opener_id
            and not exists (
              select 1
              from public.messages reply
              where reply.conversation_id = c.id
                and reply.sender_id = c.partner_id
                and reply.created_at > m.created_at
            )
        )
    ),
    last_msg as (
      select distinct on (m.conversation_id)
        m.conversation_id,
        m.body,
        m.via
      from public.messages m
      order by m.conversation_id, m.created_at desc
    )
    select
      c.id,
      c.last_message_at,
      c.is_group,
      c.dealer_id,
      shop.name,
      nullif(btrim(concat_ws(' ', buyer.first_name, buyer.last_name)), ''),
      buyer.handle,
      nullif(btrim(concat_ws(' ', partner.first_name, partner.last_name)), ''),
      partner.handle,
      (
        select count(*)::bigint
        from public.messages m
        where m.conversation_id = c.id
      ),
      exists (select 1 from waiting w where w.conversation_id = c.id),
      left(
        coalesce(
          case when lm.via = 'email' then '[email inquiry] ' else '' end || lm.body,
          ''
        ),
        160
      )
    from public.conversations c
    left join public.dealers shop on shop.id = c.dealer_id
    left join public.profiles buyer on buyer.id = c.opener_id
    left join public.profiles partner on partner.id = c.partner_id
    left join last_msg lm on lm.conversation_id = c.id
    where (p_dealer_id is null or c.dealer_id = p_dealer_id)
      and (
        not p_unanswered_only
        or exists (select 1 from waiting w where w.conversation_id = c.id)
      )
    order by c.last_message_at desc
    limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

create function public.operator_conversation_messages(
  p_conversation_id uuid,
  p_limit integer default 250
)
returns table (
  id uuid,
  created_at timestamptz,
  sender_label text,
  sender_handle text,
  body text,
  via text,
  listing_label text,
  deal_status text,
  has_photo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  if not exists (select 1 from public.conversations c where c.id = p_conversation_id) then
    raise exception 'No such conversation.' using errcode = 'P0002';
  end if;

  return query
    select
      m.id,
      m.created_at,
      nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.handle,
      m.body,
      m.via,
      nullif(btrim(concat_ws(' ', l.brand, l.model)), ''),
      cd.status::text,
      m.photo_path is not null
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.listings l on l.id = m.listing_id
    left join public.conversation_deals cd on cd.id = m.deal_id
    where m.conversation_id = p_conversation_id
    order by m.created_at asc
    limit greatest(1, least(coalesce(p_limit, 250), 500));
end;
$$;

create function public.operator_inquiries(
  p_dealer_id uuid default null,
  p_unanswered_only boolean default false,
  p_limit integer default 80
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.inquiry_status,
  message text,
  buyer_label text,
  buyer_handle text,
  shop_name text,
  listing_label text,
  conversation_id uuid,
  unanswered boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    select
      i.id,
      i.created_at,
      i.status,
      i.message,
      nullif(btrim(concat_ws(' ', buyer.first_name, buyer.last_name)), ''),
      buyer.handle,
      shop.name,
      nullif(btrim(concat_ws(' ', l.brand, l.model)), ''),
      c.id,
      (
        i.created_at < now() - interval '48 hours'
        and not exists (
          select 1
          from public.conversations cx
          join public.messages m on m.conversation_id = cx.id
          where cx.dealer_id = i.dealer_id
            and cx.opener_id = i.buyer_id
            and m.sender_id = i.buyer_id
            and m.created_at = i.created_at
        )
        and not exists (
          select 1
          from public.conversations cx
          join public.messages m on m.conversation_id = cx.id
          join public.dealers d on d.id = i.dealer_id
          where cx.dealer_id = i.dealer_id
            and cx.opener_id = i.buyer_id
            and d.claimed_by is not null
            and m.sender_id = d.claimed_by
            and m.created_at > i.created_at
        )
      )
    from public.inquiries i
    join public.dealers shop on shop.id = i.dealer_id
    join public.profiles buyer on buyer.id = i.buyer_id
    join public.listings l on l.id = i.listing_id
    left join public.conversations c
      on c.dealer_id = i.dealer_id
     and c.opener_id = i.buyer_id
     and not c.is_group
    where (p_dealer_id is null or i.dealer_id = p_dealer_id)
      and (
        not p_unanswered_only
        or (
          i.created_at < now() - interval '48 hours'
          and not exists (
            select 1
            from public.conversations cx
            join public.messages m on m.conversation_id = cx.id
            where cx.dealer_id = i.dealer_id
              and cx.opener_id = i.buyer_id
              and m.sender_id = i.buyer_id
              and m.created_at = i.created_at
          )
          and not exists (
            select 1
            from public.conversations cx
            join public.messages m on m.conversation_id = cx.id
            join public.dealers d on d.id = i.dealer_id
            where cx.dealer_id = i.dealer_id
              and cx.opener_id = i.buyer_id
              and d.claimed_by is not null
              and m.sender_id = d.claimed_by
              and m.created_at > i.created_at
          )
        )
      )
    order by i.created_at desc
    limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

revoke all on function public.operator_conversations(uuid, boolean, integer) from public, anon;
grant execute on function public.operator_conversations(uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.operator_conversation_messages(uuid, integer) from public, anon;
grant execute on function public.operator_conversation_messages(uuid, integer) to authenticated, service_role;

revoke all on function public.operator_inquiries(uuid, boolean, integer) from public, anon;
grant execute on function public.operator_inquiries(uuid, boolean, integer) to authenticated, service_role;
