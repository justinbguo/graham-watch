-- In-thread deals: a proposed price, buyer payment hold (future), Graham fee at settlement.
-- Clients create deals only through create_conversation_deal; messages.deal_id is set there.

create type public.deal_status as enum (
  'proposed',
  'accepted',
  'funded',
  'completed',
  'declined',
  'cancelled',
  'expired'
);

create table public.conversation_deals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid unique references public.messages (id) on delete set null,
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'USD' check (char_length(currency) = 3),
  listing_id uuid references public.listings (id) on delete set null,
  status public.deal_status not null default 'proposed',
  -- Graham take at settlement. Computed again when Apple Pay funds; placeholder default.
  fee_bps integer not null default 500 check (fee_bps >= 0 and fee_bps <= 5000),
  fee_cents integer check (fee_cents is null or fee_cents >= 0),
  payment_provider text,
  payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_deals_buyer_seller check (buyer_id <> seller_id)
);

create index conversation_deals_conversation_idx
  on public.conversation_deals (conversation_id, created_at desc);

alter table public.messages
  add column deal_id uuid references public.conversation_deals (id) on delete set null;

create index messages_deal_idx on public.messages (deal_id) where deal_id is not null;

drop policy "you write as yourself, where there is someone to read it" on public.messages;

create policy "you write as yourself, where there is someone to read it"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.conversation_writable(conversation_id)
  and listing_id is null
  and deal_id is null
  and via = 'app'
);

alter table public.conversation_deals enable row level security;

create policy "you read deals in your conversations"
on public.conversation_deals for select to authenticated
using (public.in_conversation(conversation_id));

revoke all on public.conversation_deals from anon, public;
grant select on public.conversation_deals to authenticated;

create function public.deal_fee_cents(p_amount_cents integer, p_fee_bps integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((p_amount_cents::bigint * p_fee_bps + 4999) / 10000)::integer;
$$;

create function public.format_deal_amount(p_amount_cents integer, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_currency = 'USD' then '$' || trim(to_char(p_amount_cents / 100.0, '999,999,999,990.00'))
    else trim(to_char(p_amount_cents / 100.0, '999,999,999,990.00')) || ' ' || p_currency
  end;
$$;

create function public.create_conversation_deal(
  p_conversation_id uuid,
  p_amount_cents integer,
  p_currency text default 'USD',
  p_listing_id uuid default null,
  p_proposer_is_seller boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  c public.conversations%rowtype;
  d public.dealers%rowtype;
  buyer uuid;
  seller uuid;
  deal_id uuid;
  msg_id uuid;
  body text;
  fee integer;
begin
  if uid is null then
    raise exception 'sign in to offer a deal';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount above zero';
  end if;
  if p_currency is null or char_length(p_currency) <> 3 then
    raise exception 'currency must be a three-letter code';
  end if;
  if not public.conversation_writable(p_conversation_id) then
    raise exception 'you cannot offer a deal in this conversation';
  end if;

  select * into c from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'that conversation is not there';
  end if;
  if c.is_group then
    raise exception 'deals in group chats are not supported yet';
  end if;

  if c.dealer_id is not null then
    select * into d from public.dealers where id = c.dealer_id;
    if d.claimed_by is null then
      raise exception 'the shop must claim its account before deals';
    end if;
    buyer := c.opener_id;
    seller := d.claimed_by;
    if p_proposer_is_seller and uid <> seller then
      raise exception 'only the shop can offer to sell in this thread';
    end if;
    if not p_proposer_is_seller and uid <> buyer then
      raise exception 'only the buyer can make a purchase offer in this thread';
    end if;
  elsif c.partner_id is not null then
    if uid not in (c.opener_id, c.partner_id) then
      raise exception 'you are not in this conversation';
    end if;
    if p_proposer_is_seller then
      seller := uid;
      buyer := case when uid = c.opener_id then c.partner_id else c.opener_id end;
    else
      buyer := uid;
      seller := case when uid = c.opener_id then c.partner_id else c.opener_id end;
    end if;
  else
    raise exception 'that conversation is not there';
  end if;

  if p_listing_id is not null then
    if not exists (
      select 1 from public.listings l
      where l.id = p_listing_id
        and l.status = 'active'
        and l.sold_at is null
    ) then
      raise exception 'that watch is not available';
    end if;
  end if;

  insert into public.conversation_deals (
    conversation_id,
    proposed_by,
    buyer_id,
    seller_id,
    amount_cents,
    currency,
    listing_id,
    fee_bps
  )
  values (
    p_conversation_id,
    uid,
    buyer,
    seller,
    p_amount_cents,
    upper(p_currency),
    p_listing_id,
    500
  )
  returning id into deal_id;

  fee := public.deal_fee_cents(p_amount_cents, 500);
  body := format(
    'Offered a deal for %s. Graham fee at payment (est.): %s.',
    public.format_deal_amount(p_amount_cents, upper(p_currency)),
    public.format_deal_amount(fee, upper(p_currency))
  );

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (p_conversation_id, uid, body, 'app', p_listing_id, deal_id)
  returning id into msg_id;

  update public.conversation_deals
  set message_id = msg_id, updated_at = now()
  where id = deal_id;

  return deal_id;
end;
$$;

create function public.respond_to_conversation_deal(p_deal_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  next_status public.deal_status;
begin
  if uid is null then
    raise exception 'sign in to respond to a deal';
  end if;

  select * into deal from public.conversation_deals where id = p_deal_id;
  if not found then
    raise exception 'that deal is not there';
  end if;
  if not public.in_conversation(deal.conversation_id) then
    raise exception 'that deal is not yours';
  end if;
  if deal.status <> 'proposed' then
    raise exception 'that deal is no longer open';
  end if;

  if p_action = 'cancel' then
    if uid <> deal.proposed_by then
      raise exception 'only whoever offered can cancel';
    end if;
    next_status := 'cancelled';
  elsif p_action = 'decline' then
    if uid = deal.proposed_by then
      raise exception 'you cannot decline your own offer';
    end if;
    if uid not in (deal.buyer_id, deal.seller_id) then
      raise exception 'you are not a party to this deal';
    end if;
    next_status := 'declined';
  else
    raise exception 'unknown action';
  end if;

  update public.conversation_deals
  set status = next_status, updated_at = now()
  where id = p_deal_id;
end;
$$;

revoke all on function public.create_conversation_deal(uuid, integer, text, uuid, boolean) from public, anon;
revoke all on function public.respond_to_conversation_deal(uuid, text) from public, anon;
grant execute on function public.create_conversation_deal(uuid, integer, text, uuid, boolean) to authenticated;
grant execute on function public.respond_to_conversation_deal(uuid, text) to authenticated;

revoke all on function public.deal_fee_cents(integer, integer) from public, anon, authenticated;
revoke all on function public.format_deal_amount(integer, text) from public, anon, authenticated;
