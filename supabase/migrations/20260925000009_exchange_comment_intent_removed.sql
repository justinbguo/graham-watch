-- A comment is a reply, not a second offer. Making someone name buying,
-- selling, or trading before they could type a word bought a filter nobody
-- needed, so the column goes rather than sit unwritten.

drop function public.exchange_thread(uuid);

alter table public.exchange_comments drop column intent;

create function public.exchange_thread(p_post_id uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  author_handle text,
  author_number integer,
  vote_count bigint,
  voted boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.body,
    c.created_at,
    c.author_handle,
    c.author_number,
    (select count(*) from public.exchange_votes v where v.comment_id = c.id),
    exists (
      select 1
      from public.exchange_votes v
      where v.comment_id = c.id and v.user_id = (select auth.uid())
    )
  from public.exchange_comments c
  where c.post_id = p_post_id
  order by c.created_at;
$$;

revoke all on function public.exchange_thread(uuid) from public, anon;
grant execute on function public.exchange_thread(uuid) to authenticated;
