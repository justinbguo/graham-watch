-- 20260919000001 deleted the caller's avatar row from storage.objects. Storage
-- has a trigger that refuses direct deletes ("Use the Storage API instead"),
-- and it raises 42501, so the whole function rolled back and no account could
-- be deleted at all.
--
-- The file is now removed by the client through the Storage API before this is
-- called, which the "users delete their own avatar" policy already allows. A
-- failure there leaves an orphaned file, not an account that cannot be deleted.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from auth.users where id = actor;

  if not found then
    raise exception 'Your account is no longer on this server.';
  end if;
end;
$$;
