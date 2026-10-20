-- Buyers name a watch on the first in-app message (listing_id). Deal rows still
-- attach listing_id only through create_conversation_deal. The deals migration
-- required listing_id null on every insert and broke inquire-from-listing.

drop policy "you write as yourself, where there is someone to read it" on public.messages;

create policy "you write as yourself, where there is someone to read it"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.conversation_writable(conversation_id)
  and deal_id is null
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
