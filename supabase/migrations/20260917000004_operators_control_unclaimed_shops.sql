-- An operator console that cannot import most shops is not a console.
--
-- 20260917000002 made controls_dealer the one answer to "does this account
-- control this shop?", and that answer is the account that added it. The
-- operator UI signs in as a person; the terminal tools sign in as
-- operator@graham.local. So every shop added from a laptop came back
-- unimportable in the browser, including the only one in production.
--
-- Being an operator is now part of that answer, but only while a shop is
-- unclaimed. A claim is a dealer taking over their own inventory, and
-- 20260917000002 exists precisely to stop an earlier importer writing over
-- them — widening this past a claim would undo it. Support for a claimed shop
-- stays a service-key job.
--
-- source_items and apply_source_item still spelled the ownership test out
-- themselves, so they move onto controls_dealer here too. That is what makes
-- the publish path agree with the rest.

create or replace function public.controls_dealer(p_dealer_id uuid)
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
            else d.created_by = (select auth.uid()) or public.is_operator()
          end
  );
$$;

-- ---------------------------------------------------------------------------
-- The catalogue, which the publish path reads and writes as the caller
-- ---------------------------------------------------------------------------

-- pending_source_items is security invoker, so this policy is what decides
-- whether an import run can see its own queue.
drop policy "dealer owners read their source items" on public.source_items;
drop policy "dealer owners update their source items" on public.source_items;
drop policy "dealer owners write their source items" on public.source_items;

create policy "shop owners read their source items"
on public.source_items for select to authenticated
using (public.controls_dealer(dealer_id));

create policy "shop owners update their source items"
on public.source_items for update to authenticated
using (public.controls_dealer(dealer_id))
with check (public.controls_dealer(dealer_id));

create policy "shop owners write their source items"
on public.source_items for insert to authenticated
with check (public.controls_dealer(dealer_id));

CREATE OR REPLACE FUNCTION public.apply_source_item(p_source_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item public.source_items;
  fields jsonb;
  target uuid;
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into item from public.source_items where id = p_source_item_id;
  if item.id is null then
    raise exception 'No such catalogue item.';
  end if;

  -- Was the ownership triple spelled out again. controls_dealer is the one
  -- answer, and it is what now lets an operator import an unclaimed shop.
  if not public.controls_dealer(item.dealer_id) then
    raise exception 'You do not manage that shop.' using errcode = '42501';
  end if;

  if item.extracted is null then
    raise exception 'That watch has not been read yet.';
  end if;

  fields := item.extracted;
  target := item.listing_id;

  perform set_config('graham.sync', 'on', true);

  if target is null then
    insert into public.listings (
      dealer_id, imported_by, source_url, brand, model, reference, year, caliber,
      winding, case_size_mm, case_material, dial_color, style, complications,
      condition, has_box, has_papers, price_cents, currency, description
    )
    values (
      item.dealer_id,
      actor,
      item.source_url,
      fields ->> 'brand',
      fields ->> 'model',
      fields ->> 'reference',
      (fields ->> 'year')::integer,
      fields ->> 'caliber',
      (fields ->> 'winding')::public.winding,
      (fields ->> 'case_size_mm')::numeric,
      (fields ->> 'case_material')::public.case_material,
      (fields ->> 'dial_color')::public.dial_color,
      (fields ->> 'style')::public.watch_style,
      coalesce(
        (select array_agg(value::public.complication)
         from jsonb_array_elements_text(fields -> 'complications')),
        '{}'
      ),
      fields ->> 'condition',
      (fields ->> 'has_box')::boolean,
      (fields ->> 'has_papers')::boolean,
      (fields ->> 'price_cents')::bigint,
      coalesce(fields ->> 'currency', 'USD'),
      fields ->> 'description'
    )
    returning id into target;
  else
    update public.listings l set
      brand = public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand'),
      model = public.keep_edit(l.edited_fields, 'model', l.model, fields ->> 'model'),
      reference = public.keep_edit(l.edited_fields, 'reference', l.reference, fields ->> 'reference'),
      year = public.keep_edit(l.edited_fields, 'year', l.year, (fields ->> 'year')::integer),
      caliber = public.keep_edit(l.edited_fields, 'caliber', l.caliber, fields ->> 'caliber'),
      winding = public.keep_edit(l.edited_fields, 'winding', l.winding, (fields ->> 'winding')::public.winding),
      case_size_mm = public.keep_edit(l.edited_fields, 'case_size_mm', l.case_size_mm, (fields ->> 'case_size_mm')::numeric),
      case_material = public.keep_edit(l.edited_fields, 'case_material', l.case_material, (fields ->> 'case_material')::public.case_material),
      dial_color = public.keep_edit(l.edited_fields, 'dial_color', l.dial_color, (fields ->> 'dial_color')::public.dial_color),
      style = public.keep_edit(l.edited_fields, 'style', l.style, (fields ->> 'style')::public.watch_style),
      complications = public.keep_edit(
        l.edited_fields,
        'complications',
        l.complications,
        coalesce(
          (select array_agg(value::public.complication)
           from jsonb_array_elements_text(fields -> 'complications')),
          '{}'::public.complication[]
        )
      ),
      condition = public.keep_edit(l.edited_fields, 'condition', l.condition, fields ->> 'condition'),
      has_box = public.keep_edit(l.edited_fields, 'has_box', l.has_box, (fields ->> 'has_box')::boolean),
      has_papers = public.keep_edit(l.edited_fields, 'has_papers', l.has_papers, (fields ->> 'has_papers')::boolean),
      price_cents = public.keep_edit(l.edited_fields, 'price_cents', l.price_cents, (fields ->> 'price_cents')::bigint),
      currency = public.keep_edit(l.edited_fields, 'currency', l.currency, coalesce(fields ->> 'currency', l.currency)),
      description = public.keep_edit(l.edited_fields, 'description', l.description, fields ->> 'description'),
      source_url = public.keep_edit(l.edited_fields, 'source_url', l.source_url, item.source_url),
      -- brand_key mirrors brand and is never edited directly, so it follows
      -- whichever brand won above rather than the feed's.
      brand_key = public.brand_key(
        public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand')
      )
    where l.id = target;
  end if;

  -- Narrow the window back to this function. Transaction-local already keeps it
  -- off the next request, but leaving it on would disarm the trigger for any
  -- later statement in the same transaction — including a dealer's own edit.
  perform set_config('graham.sync', 'off', true);

  update public.source_items
  set listing_id = target,
      applied_hash = content_hash,
      error = null
  where id = item.id;

  return target;
end;
$function$;

revoke execute on function public.apply_source_item(uuid) from public, anon;
grant execute on function public.apply_source_item(uuid) to authenticated, service_role;
