-- One chat per person. A buyer who wrote to your shop is already a thread
-- with that person: the shop owner sees them, not the shop. Starting another
-- from their profile or from New message has to open that thread.

create function public.thread_with_person(p_me uuid, p_them uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  left join public.dealers d on d.id = c.dealer_id
  where (
      c.partner_id is not null
      and least(c.opener_id, c.partner_id) = least(p_me, p_them)
      and greatest(c.opener_id, c.partner_id) = greatest(p_me, p_them)
    )
    or (d.claimed_by = p_me and c.opener_id = p_them)
    or (d.claimed_by = p_them and c.opener_id = p_me)
  order by c.last_message_at desc
  limit 1;
$$;

revoke all on function public.thread_with_person(uuid, uuid) from public, anon, authenticated;

create or replace function public.conversation_with_person(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  found uuid;
begin
  if uid is null then
    raise exception 'sign in to send a message';
  end if;
  if p_user_id is null or p_user_id = uid then
    raise exception 'a conversation needs someone else in it';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'that account is gone';
  end if;

  found := public.thread_with_person(uid, p_user_id);
  if found is not null then
    return found;
  end if;

  insert into public.conversations (opener_id, partner_id)
  values (uid, p_user_id)
  returning id into found;
  return found;

exception when unique_violation then
  -- Both sides pressed Message at once. One insert won; the other reads it.
  return public.thread_with_person(uid, p_user_id);
end;
$$;

-- Messaging their shop, when you already have a direct thread with the owner,
-- is the same chat. The row becomes the shop thread so the buyer still sees
-- the shop and the owner still sees the buyer.
create or replace function public.dealer_conversation(p_buyer_id uuid, p_dealer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found uuid;
  owner uuid;
begin
  select c.id into found
  from public.conversations c
  where c.opener_id = p_buyer_id and c.dealer_id = p_dealer_id;
  if found is not null then
    return found;
  end if;

  select d.claimed_by into owner
  from public.dealers d
  where d.id = p_dealer_id;

  if owner is not null then
    select c.id into found
    from public.conversations c
    where c.partner_id is not null
      and least(c.opener_id, c.partner_id) = least(p_buyer_id, owner)
      and greatest(c.opener_id, c.partner_id) = greatest(p_buyer_id, owner);
  end if;

  if found is not null then
    update public.conversations
    set opener_id = p_buyer_id, partner_id = null, dealer_id = p_dealer_id
    where id = found;
    return found;
  end if;

  insert into public.conversations (opener_id, dealer_id)
  values (p_buyer_id, p_dealer_id)
  returning id into found;
  return found;
end;
$$;

-- Fold a direct thread into the shop thread that is already those two people,
-- so the list does not keep both.
do $$
declare
  person record;
  shop uuid;
begin
  for person in
    select id, opener_id, partner_id, last_message_at
    from public.conversations
    where partner_id is not null
  loop
    select c.id into shop
    from public.conversations c
    join public.dealers d on d.id = c.dealer_id
    where d.claimed_by is not null
      and (
        (d.claimed_by = person.opener_id and c.opener_id = person.partner_id)
        or (d.claimed_by = person.partner_id and c.opener_id = person.opener_id)
      )
    order by c.last_message_at desc
    limit 1;

    if shop is null then
      continue;
    end if;

    update public.messages
    set conversation_id = shop
    where conversation_id = person.id;

    update public.conversations
    set last_message_at = greatest(last_message_at, person.last_message_at)
    where id = shop;

    delete from public.conversations where id = person.id;
  end loop;
end
$$;
