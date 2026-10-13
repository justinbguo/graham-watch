/**
 * The ownership checks an operator still fails.
 *
 * 20260917000002 made `controls_dealer` the one answer to "does this account
 * control this shop?", and 20260917000004 taught it that an operator controls
 * an unclaimed one. Three functions kept a copy of the triple it replaced —
 * `claimed_by = actor or created_by = actor` — and two of them run inside every
 * catalogue read. So an operator refreshing a shop somebody else added got its
 * rows written, then `You do not manage that shop.` from an RPC two statements
 * later. Every shop added from the terminal tools is in that state: they sign
 * in as operator@graham.local and the console signs in as a person.
 *
 * A substitution, not a new exemption. `controls_dealer` still answers false
 * for an operator on a claimed shop, which is 20260917000002's rule: a claim is
 * a dealer taking over their own inventory, and support for one of those stays
 * a service-key job.
 */

-- ---------------------------------------------------------------------------
-- Both halves of a catalogue read
-- ---------------------------------------------------------------------------

create or replace function public.sync_source_availability(p_dealer_id uuid, p_seen_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  retired integer;
begin
  if not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  -- Neither column a read writes is a synced column, so the edit trigger has
  -- nothing to say about this and `graham.sync` is not needed.
  --
  -- One UPDATE, not two: as separate data-modifying CTEs they target the same
  -- rows in one statement, and the second silently does nothing to a row the
  -- first already touched. That left every swept listing unstamped.
  with judged as (
    select s.listing_id, s.available, l.sold_at as was_sold
    from public.source_items s
    join public.listings l on l.id = s.listing_id
    where s.dealer_id = p_dealer_id
      and s.id = any (p_seen_ids)
  ),
  swept as (
    update public.listings l
    set availability_checked_at = now(),
        -- Only ever set from the feed, never cleared. A shop relisting a watch
        -- is a decision by the dealer, not something a read may infer.
        sold_at = case when not j.available and j.was_sold is null then now() else l.sold_at end
    from judged j
    where l.id = j.listing_id
    returning (not j.available and j.was_sold is null) as retired_now
  )
  select count(*) filter (where retired_now) into retired from swept;

  return retired;
end;
$$;

revoke execute on function public.sync_source_availability(uuid, uuid[]) from public, anon;
grant execute on function public.sync_source_availability(uuid, uuid[]) to authenticated, service_role;

create or replace function public.adopt_existing_listings(p_dealer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  adopted integer;
begin
  if not public.controls_dealer(p_dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  with paired as (
    select distinct on (s.id) s.id as source_item_id, l.id as listing_id
    from public.source_items s
    join public.listings l
      on l.dealer_id = s.dealer_id
     and public.url_path(l.source_url) = public.url_path(s.source_url)
    where s.dealer_id = p_dealer_id
      and s.listing_id is null
      and l.source_url is not null
      and not exists (
        select 1 from public.source_items other where other.listing_id = l.id
      )
    order by s.id, l.created_at
  ),
  linked as (
    update public.source_items s
    set listing_id = p.listing_id,
        -- An adopted watch is already in the deck, so it is published by
        -- definition. Leaving it unticked would offer the dealer a watch they
        -- already sell as if it were new.
        publish = true
    from paired p
    where s.id = p.source_item_id
    returning s.id
  )
  select count(*) into adopted from linked;

  return adopted;
end;
$$;

revoke execute on function public.adopt_existing_listings(uuid) from public, anon;
grant execute on function public.adopt_existing_listings(uuid) to authenticated, service_role;

-- public.dealer_stats still spells the triple out, and stays that way by
-- decision rather than by oversight: a claim transfers the shop, but not how
-- many buyers saved and asked about its watches. We keep reading those. Every
-- other power a claim moves — the contact address, edits, the catalogue — is
-- on controls_dealer, so this is the one place the two answers differ.
