-- Dealer cost basis for margin math in deal offers. Private to the shop; not on the deck card.

alter table public.listings
  add column if not exists cost_cents integer
  check (cost_cents is null or cost_cents >= 0);
