-- The other party may counter a proposed deal: new amount and they become the proposer.

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
  if uid not in (deal.buyer_id, deal.seller_id) then
    raise exception 'you are not a party to this deal';
  end if;

  countered := uid <> deal.proposed_by;
  if not countered and uid <> deal.proposed_by then
    raise exception 'only whoever offered can edit';
  end if;

  fee := public.deal_fee_cents(p_amount_cents, deal.fee_bps);

  update public.conversation_deals
  set
    amount_cents = p_amount_cents,
    fee_cents = null,
    proposed_by = case when countered then uid else proposed_by end,
    updated_at = now()
  where id = p_deal_id;

  if countered then
    body := format(
      'Countered with %s. Graham fee at payment (est.): %s.',
      public.format_deal_amount(p_amount_cents, deal.currency),
      public.format_deal_amount(fee, deal.currency)
    );
  else
    body := format(
      'Updated the offer to %s. Graham fee at payment (est.): %s.',
      public.format_deal_amount(p_amount_cents, deal.currency),
      public.format_deal_amount(fee, deal.currency)
    );
  end if;

  insert into public.messages (conversation_id, sender_id, body, via, listing_id, deal_id)
  values (deal.conversation_id, uid, body, 'app', deal.listing_id, p_deal_id);
end;
$$;
