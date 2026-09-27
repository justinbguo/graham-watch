-- A buyer can now write to a dealer from their own mail app instead of having
-- Graham send on their behalf. We hand their mail client a filled-in draft and
-- lose sight of it there: the composer may be sent, edited, or abandoned.
--
-- That is a different fact from `status`, which is about Graham's own send, so
-- it gets its own column rather than a fourth `inquiry_status`. Reading
-- `opened_at is not null and status = 'pending'` as "sent" would be a guess,
-- and a dealer count built on that guess would be wrong in the buyer's favour.
-- Stamped when the draft is composed, not when the composer appears: the app
-- cannot write this column and asking it to report back would be a second round
-- trip to learn something we already treat as unproven. It reads as "a draft was
-- prepared", which is the most this side ever knows.
alter table public.inquiries add column opened_at timestamptz;

comment on column public.inquiries.opened_at is
  'When a mail draft was prepared for the buyer''s own mail app. Not proof anything was sent.';
