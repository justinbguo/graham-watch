-- New message suggests people. Profiles stay readable only by their owner, so
-- this is the one place a list of accounts leaves the table, and it is capped
-- at eight. An empty field suggests the people you already talk to, then the
-- earliest members. conversation_with_handle still opens one exact handle.

create function public.suggest_people(p_query text)
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
    ) talked on true
    where p.handle is not null
      and p.id <> uid
    order by talked.at desc nulls last, p.collector_number
    limit 8;
    return;
  end if;

  -- A space is someone typing a name. It is not a handle prefix.
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

revoke all on function public.suggest_people(text) from public, anon;
grant execute on function public.suggest_people(text) to authenticated;
