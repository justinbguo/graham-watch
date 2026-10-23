-- An operator can correct any watch on any shop, claimed or not.
--
-- The dealer's own editor writes the listings table directly. The trigger
-- listings_mark_edits then adds the changed column to edited_fields, and the
-- nightly refresh skips those columns (keep_edit). sold_at is not one of
-- those columns: listings_mark_sold_source stamps sold_source = 'dealer', and
-- the feed refuses to clear a dealer sale.
--
-- These functions do the same writes. They do not set graham.sync, which is
-- the flag the refresh uses to say "this is the feed, do not record it as a
-- hand edit". Setting that flag here would be the bug: the next night would
-- put the shop's old price back.
--
-- Hide is status, and status is not a synced column, so a hidden watch stays
-- hidden across a refresh. Delete stays available and still cascades saves
-- and inquiries; the console asks for it more carefully than hide.

drop function public.operator_listings(uuid);

create function public.operator_listings(p_dealer_id uuid)
returns table (
  id uuid,
  source_url text,
  brand text,
  model text,
  reference text,
  year integer,
  case_size_mm numeric,
  condition text,
  description text,
  price_cents bigint,
  currency text,
  status public.listing_status,
  sold_at timestamptz,
  created_at timestamptz,
  photo_count bigint,
  thumb_path text,
  saved_count bigint,
  inquiry_count bigint,
  edited_fields text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_operator();

  return query
    select
      l.id,
      l.source_url,
      l.brand,
      l.model,
      l.reference,
      l.year,
      l.case_size_mm,
      l.condition,
      l.description,
      l.price_cents,
      l.currency,
      l.status,
      l.sold_at,
      l.created_at,
      (select count(*) from public.listing_photos p where p.listing_id = l.id),
      (
        select p.storage_path
        from public.listing_photos p
        where p.listing_id = l.id
        order by p.position
        limit 1
      ),
      (
        select count(*)
        from public.swipes s
        where s.listing_id = l.id and s.direction = 'right'
      ),
      (select count(*) from public.inquiries i where i.listing_id = l.id),
      l.edited_fields
    from public.listings l
    where l.dealer_id = p_dealer_id
    order by l.created_at desc;
end;
$$;

revoke all on function public.operator_listings(uuid) from public, anon;
grant execute on function public.operator_listings(uuid) to authenticated, service_role;

create function public.operator_set_listing_status(
  p_listing_id uuid,
  p_status public.listing_status
)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.listing_status;
  result public.listing_status;
begin
  perform public.require_operator();

  select l.status into previous
  from public.listings l
  where l.id = p_listing_id;

  if previous is null then
    raise exception 'No such watch.' using errcode = 'P0002';
  end if;

  update public.listings l
  set status = p_status
  where l.id = p_listing_id
  returning l.status into result;

  perform public.record_operator_action(
    case when result = 'hidden' then 'hide_listing' else 'show_listing' end,
    'listing',
    p_listing_id,
    jsonb_build_object('status', previous),
    jsonb_build_object('status', result)
  );

  return result;
end;
$$;

revoke all on function public.operator_set_listing_status(uuid, public.listing_status)
  from public, anon;
grant execute on function public.operator_set_listing_status(uuid, public.listing_status)
  to authenticated, service_role;

create function public.operator_set_listing_sold(
  p_listing_id uuid,
  p_sold boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous timestamptz;
  result timestamptz;
begin
  perform public.require_operator();

  if p_sold is null then
    raise exception 'Say whether the watch is sold.' using errcode = '22023';
  end if;

  select l.sold_at into previous
  from public.listings l
  where l.id = p_listing_id;

  if not found then
    raise exception 'No such watch.' using errcode = 'P0002';
  end if;

  -- Leaving graham.sync unset is what makes listings_mark_sold_source stamp
  -- sold_source = 'dealer'. A feed refresh will not clear that.
  update public.listings l
  set sold_at = case
    when p_sold and l.sold_at is null then now()
    when p_sold then l.sold_at
    else null
  end
  where l.id = p_listing_id
  returning l.sold_at into result;

  perform public.record_operator_action(
    case when p_sold then 'mark_sold' else 'mark_available' end,
    'listing',
    p_listing_id,
    jsonb_build_object('sold_at', previous),
    jsonb_build_object('sold_at', result)
  );

  return result;
end;
$$;

revoke all on function public.operator_set_listing_sold(uuid, boolean) from public, anon;
grant execute on function public.operator_set_listing_sold(uuid, boolean)
  to authenticated, service_role;

create function public.operator_edit_listing(
  p_listing_id uuid,
  p_brand text,
  p_model text default null,
  p_reference text default null,
  p_year integer default null,
  p_case_size_mm numeric default null,
  p_price_cents bigint default null,
  p_condition text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  v_brand text := nullif(btrim(p_brand), '');
  v_model text := nullif(btrim(p_model), '');
  v_reference text := nullif(btrim(p_reference), '');
  v_condition text := nullif(btrim(p_condition), '');
  v_description text := nullif(btrim(p_description), '');
begin
  perform public.require_operator();

  if v_brand is null then
    raise exception 'A watch needs a brand.' using errcode = '22023';
  end if;
  if p_year is not null and (p_year < 1800 or p_year > extract(year from now())::integer + 1) then
    raise exception 'That year is not a watch.' using errcode = '22023';
  end if;
  if p_case_size_mm is not null and (p_case_size_mm <= 0 or p_case_size_mm > 80) then
    raise exception 'Case size is in millimetres.' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents < 0 then
    raise exception 'Price cannot be negative.' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 8000 then
    raise exception 'Description is too long.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'brand', l.brand,
    'model', l.model,
    'reference', l.reference,
    'year', l.year,
    'case_size_mm', l.case_size_mm,
    'price_cents', l.price_cents,
    'condition', l.condition,
    'description', l.description,
    'edited_fields', l.edited_fields
  )
  into before_row
  from public.listings l
  where l.id = p_listing_id;

  if before_row is null then
    raise exception 'No such watch.' using errcode = 'P0002';
  end if;

  -- No graham.sync. listings_mark_edits records whatever actually changed,
  -- which is what keep_edit consults on the next refresh.
  update public.listings l
  set
    brand = v_brand,
    model = v_model,
    reference = v_reference,
    year = p_year,
    case_size_mm = p_case_size_mm,
    price_cents = p_price_cents,
    condition = v_condition,
    description = v_description
  where l.id = p_listing_id;

  perform public.record_operator_action(
    'edit_listing',
    'listing',
    p_listing_id,
    before_row,
    (
      select jsonb_build_object(
        'brand', l.brand,
        'model', l.model,
        'reference', l.reference,
        'year', l.year,
        'case_size_mm', l.case_size_mm,
        'price_cents', l.price_cents,
        'condition', l.condition,
        'description', l.description,
        'edited_fields', l.edited_fields
      )
      from public.listings l
      where l.id = p_listing_id
    )
  );
end;
$$;

revoke all on function public.operator_edit_listing(
  uuid, text, text, text, integer, numeric, bigint, text, text
) from public, anon;
grant execute on function public.operator_edit_listing(
  uuid, text, text, text, integer, numeric, bigint, text, text
) to authenticated, service_role;
