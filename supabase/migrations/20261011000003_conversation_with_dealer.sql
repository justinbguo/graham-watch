-- The shop page opens the buyer's thread with that shop, the same thread a
-- saved watch opens. No listing is required: the watch, when there is one,
-- is named on the message.

create function public.conversation_with_dealer(p_dealer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found uuid;
begin
  if me is null then
    raise exception 'Sign in to message a dealer';
  end if;

  if not exists (select 1 from public.dealers d where d.id = p_dealer_id) then
    raise exception 'That shop is no longer listed';
  end if;

  return public.dealer_conversation(me, p_dealer_id);
exception when unique_violation then
  select c.id into found
  from public.conversations c
  where c.opener_id = me and c.dealer_id = p_dealer_id;
  return found;
end;
$$;

revoke all on function public.conversation_with_dealer(uuid) from public, anon;
grant execute on function public.conversation_with_dealer(uuid) to authenticated;
