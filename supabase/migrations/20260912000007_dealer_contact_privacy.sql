-- A dealer's address is for reaching them on a buyer's behalf, not for buyers to
-- read off the deck. Only the server that sends the email needs it.
--
-- RLS filters rows; it cannot hide a column. Column grants can. The cost is that
-- any client inserting a dealer must now name the columns it wants back, because
-- RETURNING * would touch the one it may not read.
revoke select on public.dealers from anon, authenticated;
grant select (id, name, website, permission, claimed_by, created_by, created_at)
on public.dealers to anon, authenticated;
