/**
 * One answer to "does this account control this shop?".
 *
 * Ownership was spelled out at each call site as `imported_by = actor or
 * claimed_by = actor or created_by = actor`. That triple outlives the claim it
 * describes: claiming a shop sets `claimed_by` and leaves `created_by` alone, so
 * whoever imported a shop first kept write access after its real owner claimed
 * it. Checked against the local stack — the original importer rewrote the
 * `contact_email` of a claimed shop, which is the address `send-inquiry` mails
 * buyers to, and renamed the shop while they were there.
 *
 * A claim transfers control. Before one, the account that added the shop keeps
 * it, so an importer can still fix a name they typed.
 */
create function public.controls_dealer(p_dealer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dealers d
    where d.id = p_dealer_id
      and case
            when d.claimed_by is not null then d.claimed_by = (select auth.uid())
            else d.created_by = (select auth.uid())
          end
  );
$$;

revoke execute on function public.controls_dealer(uuid) from public, anon;
grant execute on function public.controls_dealer(uuid) to authenticated, service_role;

drop policy "importers may correct dealers they added" on public.dealers;

create policy "shop owners correct their shop"
on public.dealers for update to authenticated
using (public.controls_dealer(id))
with check (public.controls_dealer(id));

/**
 * A listing cannot be moved onto a shop the caller does not control.
 *
 * `with check` was satisfied by `imported_by = auth.uid()` on its own, and
 * `imported_by` records who fetched a watch once — it is not a permission.
 * Checked against the local stack: an importer patched `dealer_id` onto an
 * unrelated approved shop, which puts their listing in the deck under that
 * shop's name.
 *
 * Both clauses now ask the same question of the row's own `dealer_id`, so the
 * shop it leaves must be yours and the shop it lands on must be too. The import
 * pipeline is unaffected: it writes through `apply_source_item`, a definer
 * function that never consults this policy.
 */
drop policy "dealer owners update listings" on public.listings;

create policy "shop owners update their listings"
on public.listings for update to authenticated
using (public.controls_dealer(dealer_id))
with check (public.controls_dealer(dealer_id));

-- The gallery writer carried the same stale triple. Its caller is the dealer's
-- own session — `publishBatch` is handed the user-scoped client — so the shop
-- owner still reaches it and the earlier importer no longer does.
create or replace function public.replace_listing_photos(p_listing_id uuid, p_photos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  written integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and public.controls_dealer(l.dealer_id)
  ) then
    raise exception 'You do not manage that listing.' using errcode = '42501';
  end if;

  delete from public.listing_photos where listing_id = p_listing_id;

  -- listing_id comes from the argument, never from the payload, so a caller
  -- cannot write a gallery onto someone else's listing through this array.
  insert into public.listing_photos (listing_id, source_url, storage_path, position)
  select
    p_listing_id,
    photo ->> 'source_url',
    photo ->> 'storage_path',
    (photo ->> 'position')::integer
  from jsonb_array_elements(p_photos) as photo;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function public.replace_listing_photos(uuid, jsonb) from public, anon;
grant execute on function public.replace_listing_photos(uuid, jsonb) to authenticated, service_role;
