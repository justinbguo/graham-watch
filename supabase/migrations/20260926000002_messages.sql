-- Messages. Two people, or a person and a shop, in one thread.
--
-- A conversation has exactly two sides, so there is no member table: the two
-- sides are columns. One side is always a person — `opener_id`, whoever wrote
-- first. The other is either another person (`partner_id`) or a shop
-- (`dealer_id`).
--
-- A shop's side is not a copy of whoever claimed it. It is the claim itself,
-- read through `dealers.claimed_by` every time, so a shop that is claimed
-- next week inherits the threads a buyer started this week, and a claim that
-- moves takes the threads with it.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  opener_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid references public.profiles (id) on delete cascade,
  dealer_id uuid references public.dealers (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_one_other check ((partner_id is null) <> (dealer_id is null)),
  constraint conversations_not_yourself check (partner_id is null or partner_id <> opener_id)
);

-- One thread per pair, whichever of them wrote first, and one per shop you
-- have written to. Two threads with the same person is two halves of one
-- conversation, and neither holds the whole of it.
create unique index conversations_pair_idx
  on public.conversations (least(opener_id, partner_id), greatest(opener_id, partner_id))
  where partner_id is not null;

create unique index conversations_dealer_idx
  on public.conversations (opener_id, dealer_id)
  where dealer_id is not null;

create index conversations_opener_idx on public.conversations (opener_id, last_message_at desc);
create index conversations_partner_idx on public.conversations (partner_id, last_message_at desc);
create index conversations_shop_idx on public.conversations (dealer_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  -- What a message rode out on. `email` is the inquiry that left Graham for a
  -- shop that has no account here, kept in the thread so the buyer can see
  -- what they sent and where the answer will arrive.
  via text not null default 'app',
  -- The watch an inquiry was about. The thread names it above the message,
  -- because a buyer writes to the same shop about more than one watch.
  listing_id uuid references public.listings (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint messages_via check (via in ('app', 'email')),
  constraint messages_body_len check (char_length(btrim(body)) between 1 and 4000)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Where each person has read up to. One row per person per thread, written
-- only by `mark_conversation_read`.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

/**
 * Whether you are one of the two sides. Security definer because answering it
 * means reading `dealers.claimed_by`, and because a policy on `messages` that
 * selected from `conversations` would run that table's policy inside this one.
 */
create function public.in_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_conversation_id
      and (select auth.uid()) in (c.opener_id, c.partner_id, d.claimed_by)
  );
$$;

/**
 * Whether you can write in it. The same two sides, minus the thread with a
 * shop that has not claimed its account: there is nobody on the other end to
 * read it. That thread is the record of what was emailed.
 */
create function public.conversation_writable(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.dealers d on d.id = c.dealer_id
    where c.id = p_conversation_id
      and (select auth.uid()) in (c.opener_id, c.partner_id, d.claimed_by)
      and (c.dealer_id is null or d.claimed_by is not null)
  );
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

create policy "you read your own conversations"
on public.conversations for select to authenticated
using (public.in_conversation(id));

create policy "you open a conversation as yourself"
on public.conversations for insert to authenticated
with check (opener_id = (select auth.uid()));

create policy "you read messages in your conversations"
on public.messages for select to authenticated
using (public.in_conversation(conversation_id));

create policy "you write as yourself, where there is someone to read it"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.conversation_writable(conversation_id)
  -- A listing is named by the inquiry trigger, not typed by a client.
  and listing_id is null
  and via = 'app'
);

create policy "you read your own read marks"
on public.conversation_reads for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.conversations from anon, public;
revoke all on public.messages from anon, public;
revoke all on public.conversation_reads from anon, public;
grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.conversation_reads to authenticated;

revoke all on function public.in_conversation(uuid) from public, anon;
revoke all on function public.conversation_writable(uuid) from public, anon;
grant execute on function public.in_conversation(uuid) to authenticated;
grant execute on function public.conversation_writable(uuid) to authenticated;

-- The list is ordered by when a thread last moved, so the column has to move
-- with it. A definer trigger, because nobody may update a conversation row by
-- hand.
create function public.conversation_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
after insert on public.messages
for each row
execute function public.conversation_touch();

revoke all on function public.conversation_touch() from public, anon, authenticated;

/**
 * Find or open the thread with a person. Definer so that opening one does not
 * require reading every conversation to see whether it already exists.
 */
create function public.conversation_with_person(p_user_id uuid)
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

  select c.id into found
  from public.conversations c
  where c.partner_id is not null
    and least(c.opener_id, c.partner_id) = least(uid, p_user_id)
    and greatest(c.opener_id, c.partner_id) = greatest(uid, p_user_id);
  if found is not null then
    return found;
  end if;

  insert into public.conversations (opener_id, partner_id)
  values (uid, p_user_id)
  returning id into found;
  return found;

exception when unique_violation then
  -- Both sides pressed Message at once. One insert won; the other reads it.
  select c.id into found
  from public.conversations c
  where c.partner_id is not null
    and least(c.opener_id, c.partner_id) = least(uid, p_user_id)
    and greatest(c.opener_id, c.partner_id) = greatest(uid, p_user_id);
  return found;
end;
$$;

revoke all on function public.conversation_with_person(uuid) from public, anon;
grant execute on function public.conversation_with_person(uuid) to authenticated;

create function public.dealer_conversation(p_buyer_id uuid, p_dealer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found uuid;
begin
  select c.id into found
  from public.conversations c
  where c.opener_id = p_buyer_id and c.dealer_id = p_dealer_id;
  if found is not null then
    return found;
  end if;

  insert into public.conversations (opener_id, dealer_id)
  values (p_buyer_id, p_dealer_id)
  returning id into found;
  return found;
end;
$$;

revoke all on function public.dealer_conversation(uuid, uuid) from public, anon, authenticated;

/**
 * An inquiry opens a thread with the shop and drops what was sent into it.
 *
 * The email still goes out the same way — this does not replace it. It gives
 * the buyer one place to see what they asked, whether or not the shop ever
 * signs in. When the shop has claimed its account it can answer here.
 */
create function public.inquiry_opens_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  conv := public.dealer_conversation(new.buyer_id, new.dealer_id);
  insert into public.messages (conversation_id, sender_id, body, via, listing_id, created_at)
  values (
    conv,
    new.buyer_id,
    coalesce(nullif(btrim(new.message), ''), 'I am interested in this watch.'),
    'email',
    new.listing_id,
    new.created_at
  );
  return new;
end;
$$;

create trigger inquiries_open_conversation
after insert on public.inquiries
for each row
execute function public.inquiry_opens_conversation();

revoke all on function public.inquiry_opens_conversation() from public, anon, authenticated;

-- Every inquiry already sent, in the order it was sent, so the tab does not
-- open empty for someone who has been using the app for a month.
do $backfill$
declare
  row record;
  conv uuid;
begin
  for row in select * from public.inquiries order by created_at loop
    conv := public.dealer_conversation(row.buyer_id, row.dealer_id);
    insert into public.messages (conversation_id, sender_id, body, via, listing_id, created_at)
    values (
      conv,
      row.buyer_id,
      coalesce(nullif(btrim(row.message), ''), 'I am interested in this watch.'),
      'email',
      row.listing_id,
      row.created_at
    );
  end loop;

  update public.conversations c
  set last_message_at = m.last_at
  from (
    select conversation_id, max(created_at) as last_at
    from public.messages
    group by conversation_id
  ) m
  where m.conversation_id = c.id;
end
$backfill$;

/**
 * The tab's list. One row per thread: who it is with, the last thing said,
 * and how much of it you have not read.
 *
 * Definer, for the same reason the exchange functions are: the other side's
 * name and photograph live in `profiles`, which is readable only by its
 * owner. Their name, their photograph, and what they wrote to you — nothing
 * else about them crosses that line.
 */
create function public.conversation_list()
returns table (
  id uuid,
  dealer_id uuid,
  dealer_name text,
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

/** One thread's header: the same facts as its row in the list, plus whether you can write. */
create function public.conversation_header(p_conversation_id uuid)
returns table (
  id uuid,
  dealer_id uuid,
  dealer_name text,
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

/** Read up to now. The only writer of `conversation_reads`. */
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not public.in_conversation(p_conversation_id) then
    raise exception 'that conversation is not yours';
  end if;

  insert into public.conversation_reads (conversation_id, user_id, read_at)
  values (p_conversation_id, uid, now())
  on conflict (conversation_id, user_id)
  do update set read_at = greatest(public.conversation_reads.read_at, excluded.read_at);
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
