-- Drop has_photo from operator_conversation_messages; operators do not audit attachments here.

drop function if exists public.operator_conversation_messages(uuid, integer);

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
  deal_status text
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
      cd.status::text
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.listings l on l.id = m.listing_id
    left join public.conversation_deals cd on cd.id = m.deal_id
    where m.conversation_id = p_conversation_id
    order by m.created_at asc
    limit greatest(1, least(coalesce(p_limit, 250), 500));
end;
$$;

revoke all on function public.operator_conversation_messages(uuid, integer) from public, anon;
grant execute on function public.operator_conversation_messages(uuid, integer) to authenticated, service_role;
