-- Phase 1 marketplace deals: accept → fund (dev hold) → complete → mark listing sold.

create or replace function public.create_conversation_deal(
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

  if exists (
    select 1
    from public.conversation_deals cd
    where cd.conversation_id = p_conversation_id
      and cd.status in ('proposed', 'accepted', 'funded')
  ) then
    raise exception 'finish or cancel the open deal before starting another';
  end if;

  if c.dealer_id is not null then
    select * into d from public.dealers where id = c.dealer_id;
    if d.claimed_by is null then
      raise exception 'the shop must claim its account before deals';
    end if;
    if p_listing_id is null then
      raise exception 'name the watch this deal is for';
    end if;
    if not exists (
      select 1
      from public.listings l
      where l.id = p_listing_id
        and l.dealer_id = c.dealer_id
        and l.status = 'active'
        and l.sold_at is null
    ) then
      raise exception 'that watch is not available from this shop';
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

  if p_listing_id is not null and c.dealer_id is null then
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

create or replace function public.respond_to_conversation_deal(p_deal_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  next_status public.deal_status;
  body text;
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
    body := 'Cancelled the deal offer.';
  elsif p_action = 'decline' then
    if uid = deal.proposed_by then
      raise exception 'you cannot decline your own offer';
    end if;
    if uid not in (deal.buyer_id, deal.seller_id) then
      raise exception 'you are not a party to this deal';
    end if;
    next_status := 'declined';
    body := 'Declined the deal offer.';
  elsif p_action = 'accept' then
    if uid = deal.proposed_by then
      raise exception 'you cannot accept your own offer';
    end if;
    if uid not in (deal.buyer_id, deal.seller_id) then
      raise exception 'you are not a party to this deal';
    end if;
    next_status := 'accepted';
    body := format(
      'Accepted the deal for %s.',
      public.format_deal_amount(deal.amount_cents, deal.currency)
    );
  else
    raise exception 'unknown action';
  end if;

  update public.conversation_deals
  set status = next_status, updated_at = now()
  where id = p_deal_id;

  if body is not null then
    insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
    values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
  end if;
end;
$$;

create or replace function public.fund_conversation_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  fee integer;
  body text;
begin
  if uid is null then
    raise exception 'sign in to pay for a deal';
  end if;

  select * into deal from public.conversation_deals where id = p_deal_id;
  if not found then
    raise exception 'that deal is not there';
  end if;
  if not public.in_conversation(deal.conversation_id) then
    raise exception 'that deal is not yours';
  end if;
  if deal.status <> 'accepted' then
    raise exception 'that deal is not ready for payment';
  end if;
  if uid <> deal.buyer_id then
    raise exception 'only the buyer can pay for this deal';
  end if;

  fee := public.deal_fee_cents(deal.amount_cents, deal.fee_bps);

  update public.conversation_deals
  set
    status = 'funded',
    fee_cents = fee,
    payment_provider = 'dev_hold',
    updated_at = now()
  where id = p_deal_id;

  body := format(
    'Payment held for %s. Graham fee: %s. Confirm receipt when the watch arrives.',
    public.format_deal_amount(deal.amount_cents, deal.currency),
    public.format_deal_amount(fee, deal.currency)
  );

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;

create or replace function public.complete_conversation_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  body text;
begin
  if uid is null then
    raise exception 'sign in to complete a deal';
  end if;

  select * into deal from public.conversation_deals where id = p_deal_id;
  if not found then
    raise exception 'that deal is not there';
  end if;
  if not public.in_conversation(deal.conversation_id) then
    raise exception 'that deal is not yours';
  end if;
  if deal.status <> 'funded' then
    raise exception 'that deal is not waiting for confirmation';
  end if;
  if uid <> deal.buyer_id then
    raise exception 'only the buyer can confirm receipt';
  end if;

  if deal.listing_id is not null then
    update public.listings
    set sold_at = coalesce(sold_at, now())
    where id = deal.listing_id;
  end if;

  update public.conversation_deals
  set status = 'completed', updated_at = now()
  where id = p_deal_id;

  body := 'Confirmed receipt. Deal completed.';

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;

revoke all on function public.fund_conversation_deal(uuid) from public, anon;
revoke all on function public.complete_conversation_deal(uuid) from public, anon;
grant execute on function public.fund_conversation_deal(uuid) to authenticated;
grant execute on function public.complete_conversation_deal(uuid) to authenticated;
