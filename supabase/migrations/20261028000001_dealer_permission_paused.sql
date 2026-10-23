-- A published shop can be held without being revoked.
--
-- `paused` is not `approved`, so every buyer-facing check that already
-- requires `permission = 'approved'` (the deck, search, inquiries) hides the
-- shop, and the nightly refresh lists only approved shops, so it skips them
-- too. Resume is publishing again. Revoke stays the harder decision: the
-- console shows a different word, and pause is refused unless the shop is
-- published right now.
--
-- The new value is not used in this file. Postgres accepts ADD VALUE inside
-- a transaction and then refuses to let that same transaction mention the
-- value. The next migration is the one that branches on it.

alter type public.dealer_permission add value if not exists 'paused' after 'approved';
