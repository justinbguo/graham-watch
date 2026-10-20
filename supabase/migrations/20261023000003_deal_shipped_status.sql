-- A funded deal waits on the seller before the buyer can confirm receipt.
-- Own file: Postgres refuses to use a new enum value in the transaction that added it.
alter type public.deal_status add value if not exists 'shipped' before 'completed';
