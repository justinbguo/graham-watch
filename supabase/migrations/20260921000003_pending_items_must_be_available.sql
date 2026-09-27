-- A picker can stay open while a watch sells. The operator now refreshes the
-- shop immediately before import, but the queue is the final safety boundary:
-- an unavailable source row must never become a listing, even if a stale tab
-- or another client left `publish = true`.

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
    and (
      s.extracted_hash is distinct from s.text_hash
      or s.applied_hash is distinct from s.content_hash
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
        and s.error is null
        and (
          s.extracted_hash is distinct from s.text_hash
          or s.applied_hash is distinct from s.content_hash
        )
    )::integer,
    count(*) filter (where s.available and s.error is not null)::integer
  from public.source_items s
  where s.dealer_id = p_dealer_id
    and s.publish;
$$;
