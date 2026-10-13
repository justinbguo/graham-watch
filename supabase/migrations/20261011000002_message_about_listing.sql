-- A saved watch opens the buyer's thread with that shop. The client cannot
-- call dealer_conversation itself: that function is revoked, and only the
-- inquiry trigger used to reach it. This is the same door, from a listing.

create function public.conversation_about_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  shop uuid;
begin
  if me is null then
    raise exception 'Sign in to message a dealer';
  end if;

  select l.dealer_id into shop
  from public.listings l
  where l.id = p_listing_id;

  if shop is null then
    raise exception 'That watch has no dealer to message';
  end if;

  return public.dealer_conversation(me, shop);
end;
$$;

revoke all on function public.conversation_about_listing(uuid) from public, anon;
grant execute on function public.conversation_about_listing(uuid) to authenticated;

-- A message may name a watch, but only one this shop is selling, and only
-- from the buyer who opened the thread. The inquiry trigger still names the
-- watch on mail that left the app. A client used to be unable to set
-- listing_id at all, so an in-app reply could not say which watch it was about.

drop policy "you write as yourself, where there is someone to read it" on public.messages;

create policy "you write as yourself, where there is someone to read it"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.conversation_writable(conversation_id)
  and via = 'app'
  and (
    listing_id is null
    or exists (
      select 1
      from public.conversations c
      join public.listings l on l.id = listing_id
      where c.id = conversation_id
        and c.opener_id = (select auth.uid())
        and c.dealer_id = l.dealer_id
    )
  )
);
