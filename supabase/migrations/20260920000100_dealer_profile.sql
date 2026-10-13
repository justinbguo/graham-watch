-- A dealer page held a mark, a name and two counts. Everything else a buyer
-- wants before writing to a stranger about a $40,000 watch — who this shop is,
-- where else they exist — was already on the shop's homepage, which the
-- importer downloads to read the shop's name and then throws away.
--
-- Measured over eight real dealer sites before choosing these three: a meta
-- description on 8, an Instagram handle on 7, an icon declared in the page on
-- 6. A phone number appeared on 1 and a postal address on 0, which is why
-- neither is here — a column that is blank seven times in eight is a blank
-- space on a page, and this schema already deleted an invented dealer rating
-- rather than print a figure it could not stand behind.
--
-- All three are derived, never authored. A refresh overwrites them, because a
-- logo URL on a shop's CDN outlives neither a redesign nor a platform move. The
-- day a dealer edits their own description, this needs the `edited_fields`
-- treatment that listings already carry; until then there is nothing to protect.

alter table public.dealers
  add column description text
    constraint dealers_description_length check (char_length(description) <= 500),
  -- Handle alone. Storing a URL would mean every reader parses one back out,
  -- and Instagram's own path rules are the only thing that makes it a handle.
  add column instagram text
    constraint dealers_instagram_handle check (instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  -- Absolute and https, because this is handed straight to an <Image> on a
  -- phone and a relative path there resolves against our own bundle.
  add column logo_url text
    constraint dealers_logo_url_https check (logo_url ~ '^https://');

comment on column public.dealers.description is
  'The shop describing itself, taken from its own meta description. Never written by us.';
comment on column public.dealers.instagram is
  'Handle only — no @, no URL.';
comment on column public.dealers.logo_url is
  'The icon the shop declares in its HTML, resolved absolute and confirmed to load.';

-- 20260912000007 revoked select on this table and grants it back one column at
-- a time, so a new column is unreadable until it is named here. contact_email
-- stays out of that list, exactly as it was: these three are for showing a
-- buyer, and an address for reaching the shop is still the server's alone.
grant select (description, instagram, logo_url) on public.dealers to anon, authenticated;

-- UPDATE is granted a column at a time too, and only `name` and
-- `contact_email` were in that list — a dealer may correct their own name and
-- address and nothing else. The importer writes these three as the signed-in
-- caller, so without naming them here every write is refused and every dealer
-- page stays blank while the catalogue read reports success.
--
-- Row-level access is unchanged: "shop owners correct their shop" still gates
-- this on controls_dealer(id), so this widens which columns a shop's own
-- operator may write, never which shops.
grant update (description, instagram, logo_url) on public.dealers to authenticated;
