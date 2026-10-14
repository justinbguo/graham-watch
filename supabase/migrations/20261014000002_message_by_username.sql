-- Profiles are readable only by their owner, so the client cannot look a
-- handle up itself. This resolves one exact username to the thread with that
-- account. A prefix is not a search: there is no list of people to browse.

create function public.conversation_with_handle(p_handle text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  cleaned text;
  target uuid;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;

  cleaned := lower(btrim(coalesce(p_handle, '')));
  if left(cleaned, 1) = '@' then
    cleaned := substr(cleaned, 2);
  end if;

  -- The same pattern as profiles_handle_format. A shorter string is someone
  -- still typing, and it must not match a row.
  if cleaned !~ '^[a-z][a-z0-9_]{2,19}$' then
    raise exception 'That username is not valid.';
  end if;

  select p.id into target
  from public.profiles p
  where p.handle = cleaned;

  if target is null then
    raise exception 'No one has that username.';
  end if;

  if target = uid then
    raise exception 'That username is yours.';
  end if;

  return public.conversation_with_person(target);
end;
$$;

revoke all on function public.conversation_with_handle(text) from public, anon;
grant execute on function public.conversation_with_handle(text) to authenticated;
