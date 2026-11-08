alter table public.source_items
  add column hold_reason text;

alter table public.source_items
  add constraint source_items_hold_reason_check
  check (hold_reason is null or hold_reason in ('strap', 'accessory', 'clock'));

create or replace function public.apply_source_item(p_source_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.source_items;
  fields jsonb;
  target uuid;
  actor uuid := (select auth.uid());
  request_role text;
begin
  select * into item from public.source_items where id = p_source_item_id;
  if item.id is null then
    raise exception 'No such catalogue item.';
  end if;

  if item.hold_reason is not null then
    raise exception 'Held catalogue item (%) is not published.', item.hold_reason
      using errcode = 'check_violation';
  end if;

  if actor is null then
    select coalesce(d.claimed_by, d.created_by) into actor
    from public.dealers d
    where d.id = item.dealer_id;

    if actor is null then
      request_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
      if request_role is not null and request_role <> 'service_role' then
        raise exception 'Sign in first.' using errcode = '42501';
      end if;
    end if;
  elsif not public.controls_dealer(item.dealer_id) then
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
      brand_key = public.brand_key(
        public.keep_edit(l.edited_fields, 'brand', l.brand, fields ->> 'brand')
      )
    where l.id = target;
  end if;

  perform set_config('graham.sync', 'off', true);

  update public.source_items
  set listing_id = target,
      error = null
  where id = item.id;

  return target;
end;
$$;

create or replace function public.pending_source_items(
  p_dealer_id uuid,
  p_limit integer default 10
)
returns setof public.source_items
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish
    and s.available
    and s.hold_reason is null
    and (
      s.extracted_hash is distinct from s.text_hash
      or s.applied_hash is distinct from s.content_hash
      or (
        s.listing_id is not null
        and (
          s.photos_hash is null
          or not public.listing_gallery_ready(s.listing_id)
        )
      )
    )
    and s.error is null
  order by s.first_seen_at
  limit least(greatest(p_limit, 1), 25);
$$;

create or replace function public.pending_source_item_count(p_dealer_id uuid)
returns table (pending integer, failed integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (
      where s.available
        and s.hold_reason is null
        and s.error is null
        and (
          s.extracted_hash is distinct from s.text_hash
          or s.applied_hash is distinct from s.content_hash
          or (
            s.listing_id is not null
            and (
              s.photos_hash is null
              or not public.listing_gallery_ready(s.listing_id)
            )
          )
        )
    )::integer,
    count(*) filter (
      where s.available and s.hold_reason is null and s.error is not null
    )::integer
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish;
$$;
