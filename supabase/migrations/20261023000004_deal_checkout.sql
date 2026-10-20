-- Phase 0 deal checkout with no money: accept → hold (placeholder) → ship with
-- the seller's own tracking number → buyer confirms → buyer reviews.
-- Stripe Connect replaces the hold later behind the same RPC boundary.

-- Buyer defaults. Own row only: a street address is not profile data, and
-- profiles are readable by other signed-in users.
create table public.checkout_defaults (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ship_to jsonb,
  -- Placeholder until Stripe: a label such as "Test card •••• 4242". Never a card number.
  payment_label text check (payment_label is null or char_length(payment_label) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.checkout_defaults enable row level security;

create policy "you read your own checkout defaults"
on public.checkout_defaults for select to authenticated
using (user_id = (select auth.uid()));

create policy "you add your own checkout defaults"
on public.checkout_defaults for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "you change your own checkout defaults"
on public.checkout_defaults for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.checkout_defaults from anon, public;
grant select, insert, update on public.checkout_defaults to authenticated;

alter table public.conversation_deals
  add column expires_at timestamptz,
  add column accepted_at timestamptz,
  add column funded_at timestamptz,
  -- Shipping promise: five days from payment. Product constant for now.
  add column ship_by timestamptz,
  add column shipped_at timestamptz,
  add column completed_at timestamptz,
  add column reviewed_at timestamptz,
  add column ship_to jsonb,
  add column tracking_carrier text,
  add column tracking_number text,
  add column cancelled_reason text;

create index conversation_deals_listing_open_idx
  on public.conversation_deals (listing_id)
  where listing_id is not null and status in ('proposed', 'accepted', 'funded', 'shipped');

-- One review per completed deal. Readable to everyone signed in so a shop page
-- can show real ratings instead of the seeded ones it used to invent.
create table public.deal_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references public.conversation_deals (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  dealer_id uuid references public.dealers (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index deal_reviews_subject_idx on public.deal_reviews (subject_id, created_at desc);
create index deal_reviews_dealer_idx
  on public.deal_reviews (dealer_id, created_at desc)
  where dealer_id is not null;

alter table public.deal_reviews enable row level security;

create policy "reviews are readable when signed in"
on public.deal_reviews for select to authenticated
using (true);

revoke all on public.deal_reviews from anon, public;
grant select on public.deal_reviews to authenticated;

-- Required keys for a ship-to block. The dealer gets exactly this and nothing else.
create function public.ship_to_is_complete(p_ship_to jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ship_to is not null
    and jsonb_typeof(p_ship_to) = 'object'
    and nullif(trim(p_ship_to->>'name'), '') is not null
    and nullif(trim(p_ship_to->>'line1'), '') is not null
    and nullif(trim(p_ship_to->>'city'), '') is not null
    and nullif(trim(p_ship_to->>'region'), '') is not null
    and nullif(trim(p_ship_to->>'postal_code'), '') is not null
    and nullif(trim(p_ship_to->>'country'), '') is not null;
$$;

-- Offers that ran out of time. Called where a write already happens so the
-- status lands; read paths derive "expired" from expires_at instead.
create function public.expire_conversation_deals(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_deals
  set status = 'expired', updated_at = now()
  where conversation_id = p_conversation_id
    and status = 'proposed'
    and expires_at is not null
    and expires_at <= now();
$$;

revoke all on function public.expire_conversation_deals(uuid) from public, anon;

drop function public.create_conversation_deal(uuid, integer, text, uuid, boolean);

create function public.create_conversation_deal(
  p_conversation_id uuid,
  p_amount_cents integer,
  p_currency text default 'USD',
  p_listing_id uuid default null,
  p_proposer_is_seller boolean default true,
  p_expires_in_hours integer default 72
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
  expires timestamptz;
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
  if p_expires_in_hours is null or p_expires_in_hours < 1 or p_expires_in_hours > 336 then
    raise exception 'an offer lasts between 1 hour and 14 days';
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

  perform public.expire_conversation_deals(p_conversation_id);

  if exists (
    select 1
    from public.conversation_deals cd
    where cd.conversation_id = p_conversation_id
      and cd.status in ('proposed', 'accepted', 'funded', 'shipped')
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

  expires := now() + make_interval(hours => p_expires_in_hours);

  insert into public.conversation_deals (
    conversation_id,
    proposed_by,
    buyer_id,
    seller_id,
    amount_cents,
    currency,
    listing_id,
    fee_bps,
    expires_at
  )
  values (
    p_conversation_id,
    uid,
    buyer,
    seller,
    p_amount_cents,
    upper(p_currency),
    p_listing_id,
    500,
    expires
  )
  returning id into deal_id;

  fee := public.deal_fee_cents(p_amount_cents, 500);
  body := format(
    'Offered a deal for %s. Graham fee at payment (est.): %s. Expires %s.',
    public.format_deal_amount(p_amount_cents, upper(p_currency)),
    public.format_deal_amount(fee, upper(p_currency)),
    to_char(expires at time zone 'UTC', 'Mon FMDD')
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

revoke all on function public.create_conversation_deal(uuid, integer, text, uuid, boolean, integer)
  from public, anon;
grant execute on function public.create_conversation_deal(uuid, integer, text, uuid, boolean, integer)
  to authenticated;

create or replace function public.respond_to_conversation_deal(p_deal_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  other public.conversation_deals%rowtype;
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
    if deal.expires_at is not null and deal.expires_at <= now() then
      raise exception 'that offer has expired';
    end if;
    next_status := 'accepted';
    body := format(
      'Accepted the deal for %s.',
      public.format_deal_amount(deal.amount_cents, deal.currency)
    );

    -- One watch, one buyer. Every other open offer on this listing closes now,
    -- so a seller who sent several cannot end up with two acceptances.
    if deal.listing_id is not null then
      for other in
        select *
        from public.conversation_deals cd
        where cd.listing_id = deal.listing_id
          and cd.id <> deal.id
          and cd.status in ('proposed', 'accepted')
      loop
        update public.conversation_deals
        set status = 'cancelled', cancelled_reason = 'listing_reserved', updated_at = now()
        where id = other.id;

        insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
        values (
          other.conversation_id,
          other.seller_id,
          'This watch was reserved in another deal, so this offer is closed.',
          'app',
          other.listing_id,
          other.id
        );
      end loop;
    end if;
  else
    raise exception 'unknown action';
  end if;

  update public.conversation_deals
  set
    status = next_status,
    accepted_at = case when next_status = 'accepted' then now() else accepted_at end,
    updated_at = now()
  where id = p_deal_id;

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;

-- A changed amount is a fresh offer: the clock restarts.
create or replace function public.revise_conversation_deal(
  p_deal_id uuid,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  body text;
  fee integer;
  countered boolean;
  expires timestamptz := now() + interval '72 hours';
begin
  if uid is null then
    raise exception 'sign in to edit a deal';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount above zero';
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
  if deal.expires_at is not null and deal.expires_at <= now() then
    raise exception 'that offer has expired';
  end if;
  if uid not in (deal.buyer_id, deal.seller_id) then
    raise exception 'you are not a party to this deal';
  end if;

  countered := uid <> deal.proposed_by;
  fee := public.deal_fee_cents(p_amount_cents, deal.fee_bps);

  update public.conversation_deals
  set
    amount_cents = p_amount_cents,
    fee_cents = null,
    proposed_by = case when countered then uid else proposed_by end,
    expires_at = expires,
    updated_at = now()
  where id = p_deal_id;

  body := format(
    case when countered
      then 'Countered with %s. Graham fee at payment (est.): %s. Expires %s.'
      else 'Updated the offer to %s. Graham fee at payment (est.): %s. Expires %s.'
    end,
    public.format_deal_amount(p_amount_cents, deal.currency),
    public.format_deal_amount(fee, deal.currency),
    to_char(expires at time zone 'UTC', 'Mon FMDD')
  );

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;

drop function public.fund_conversation_deal(uuid);

-- Placeholder hold. Stores the ship-to block the seller will see and starts the
-- shipping clock. `p_payment_label` is display text only until Stripe exists.
create function public.fund_conversation_deal(
  p_deal_id uuid,
  p_ship_to jsonb,
  p_payment_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  fee integer;
  due timestamptz := now() + interval '5 days';
  body text;
begin
  if uid is null then
    raise exception 'sign in to pay for a deal';
  end if;
  if not public.ship_to_is_complete(p_ship_to) then
    raise exception 'enter a complete shipping address';
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
    payment_intent_id = 'dev_' || replace(p_deal_id::text, '-', ''),
    ship_to = p_ship_to,
    funded_at = now(),
    ship_by = due,
    updated_at = now()
  where id = p_deal_id;

  body := format(
    'Payment held (test) for %s. Graham fee: %s. Ship by %s.',
    public.format_deal_amount(deal.amount_cents, deal.currency),
    public.format_deal_amount(fee, deal.currency),
    to_char(due at time zone 'UTC', 'Mon FMDD')
  );

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;

revoke all on function public.fund_conversation_deal(uuid, jsonb, text) from public, anon;
grant execute on function public.fund_conversation_deal(uuid, jsonb, text) to authenticated;

-- The seller ships with their own label and pastes the tracking number. Graham
-- does not buy labels.
create function public.ship_conversation_deal(
  p_deal_id uuid,
  p_carrier text,
  p_tracking_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  carrier text := nullif(trim(p_carrier), '');
  tracking text := nullif(trim(p_tracking_number), '');
begin
  if uid is null then
    raise exception 'sign in to update a deal';
  end if;
  if carrier is null or char_length(carrier) > 40 then
    raise exception 'name the carrier';
  end if;
  if tracking is null or char_length(tracking) > 80 then
    raise exception 'enter the tracking number';
  end if;

  select * into deal from public.conversation_deals where id = p_deal_id;
  if not found then
    raise exception 'that deal is not there';
  end if;
  if not public.in_conversation(deal.conversation_id) then
    raise exception 'that deal is not yours';
  end if;
  if deal.status <> 'funded' then
    raise exception 'that deal is not waiting to ship';
  end if;
  if uid <> deal.seller_id then
    raise exception 'only the seller can mark a deal shipped';
  end if;

  update public.conversation_deals
  set
    status = 'shipped',
    tracking_carrier = carrier,
    tracking_number = tracking,
    shipped_at = now(),
    updated_at = now()
  where id = p_deal_id;

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (
    deal.conversation_id,
    uid,
    format('Shipped via %s. Tracking %s.', carrier, tracking),
    'app',
    deal.listing_id,
    p_deal_id
  );
end;
$$;

revoke all on function public.ship_conversation_deal(uuid, text, text) from public, anon;
grant execute on function public.ship_conversation_deal(uuid, text, text) to authenticated;

-- Receipt follows shipment. A seller cannot be paid out on a watch that never left.
create or replace function public.complete_conversation_deal(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
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
  if deal.status <> 'shipped' then
    raise exception 'that deal has not shipped yet';
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
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_deal_id;

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, 'Confirmed receipt. Deal completed.', 'app', deal.listing_id, p_deal_id);
end;
$$;

create function public.review_conversation_deal(
  p_deal_id uuid,
  p_rating integer,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  deal public.conversation_deals%rowtype;
  shop uuid;
  review_id uuid;
  words text := nullif(trim(p_body), '');
begin
  if uid is null then
    raise exception 'sign in to leave a review';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rate from 1 to 5';
  end if;

  select * into deal from public.conversation_deals where id = p_deal_id;
  if not found then
    raise exception 'that deal is not there';
  end if;
  if deal.status <> 'completed' then
    raise exception 'review a deal once it is completed';
  end if;
  if uid <> deal.buyer_id then
    raise exception 'only the buyer reviews a deal';
  end if;
  if deal.reviewed_at is not null then
    raise exception 'this deal already has a review';
  end if;

  select c.dealer_id into shop from public.conversations c where c.id = deal.conversation_id;

  insert into public.deal_reviews (deal_id, reviewer_id, subject_id, dealer_id, rating, body)
  values (p_deal_id, uid, deal.seller_id, shop, p_rating, words)
  returning id into review_id;

  update public.conversation_deals
  set reviewed_at = now(), updated_at = now()
  where id = p_deal_id;

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (
    deal.conversation_id,
    uid,
    format('Rated this deal %s/5.', p_rating),
    'app',
    deal.listing_id,
    p_deal_id
  );

  return review_id;
end;
$$;

revoke all on function public.review_conversation_deal(uuid, integer, text) from public, anon;
grant execute on function public.review_conversation_deal(uuid, integer, text) to authenticated;
