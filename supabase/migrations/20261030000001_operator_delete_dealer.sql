-- Operators delete shops from the console the same way the terminal does:
-- cascade the dealer row, return photo paths for storage cleanup.

create or replace function public.operator_delete_dealer(p_dealer_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  paths text[];
begin
  perform public.require_operator();

  select to_jsonb(d) into snapshot
  from public.dealers d
  where d.id = p_dealer_id;

  if snapshot is null then
    raise exception 'No such shop.';
  end if;

  select array_remove(array_agg(p.storage_path), null)
    into paths
  from public.listing_photos p
  join public.listings l on l.id = p.listing_id
  where l.dealer_id = p_dealer_id;

  delete from public.dealers where id = p_dealer_id;

  perform public.record_operator_action(
    'delete_dealer',
    'shop',
    p_dealer_id,
    snapshot,
    null
  );

  return coalesce(paths, array[]::text[]);
end;
$$;

revoke all on function public.operator_delete_dealer(uuid) from public, anon;
grant execute on function public.operator_delete_dealer(uuid) to authenticated, service_role;
