-- A message already names the other account. Its avatar needs a durable
-- profile route that still works after a reload, including when they have no
-- community posts from which to recover these fields.

create function public.collector_profile(p_user_id uuid)
returns table (
  id uuid,
  handle text,
  name text,
  avatar_url text,
  collector_number integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.handle,
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    p.avatar_url,
    p.collector_number
  from public.profiles p
  where auth.uid() is not null
    and p.id = p_user_id;
$$;

revoke all on function public.collector_profile(uuid) from public, anon;
grant execute on function public.collector_profile(uuid) to authenticated;
