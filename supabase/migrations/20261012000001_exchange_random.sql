-- A post that is none of the three: a watch someone wants to show, a question,
-- a find. It carries no price, like a trade, and still needs a photo.
alter type public.exchange_intent add value if not exists 'random';
