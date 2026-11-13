-- A deleted account frees its collector number. The next sign-up takes the
-- lowest positive integer no living profile holds. Deleting the only account
-- makes the next sign-up #1. Deleting #3 of 1-3 makes the next #3. Deleting
-- #2 of 1-3 makes the next #2. A living number never changes, and nobody else
-- is renumbered.
--
-- The sequence could not do this. nextval and setval survive a rollback, so
-- lowering it on delete would hand out a live number after a delete that rolled
-- back. Every delete path (delete_own_account, the admin API, test cleanup)
-- frees the number by removing the row; none of them needs to know.

alter table public.profiles
  alter column collector_number drop default;

drop sequence public.collector_number_seq;

-- A trigger rather than a default: a default needs a callable function, which
-- PostgREST would publish from public. Security definer because the gap query
-- has to see every profile, and RLS shows a caller only their own.
create function public.profiles_assign_collector_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collector_number is not null then
    raise exception 'a collector number is assigned, not chosen';
  end if;

  -- Held until the signing-up transaction ends. Under read committed the next
  -- statement takes a fresh snapshot, so the next caller sees this row. The
  -- unique key still refuses a duplicate from anything that slips past the lock.
  perform pg_advisory_xact_lock(hashtext('public.profiles.collector_number'));

  -- 1, and one past every living number. The smallest of those that nobody
  -- holds is the next Collector #. A freed middle number is in that set.
  select min(holes.candidate)
    into new.collector_number
  from (
    select 1 as candidate
    union all
    select p.collector_number + 1
    from public.profiles p
    where p.collector_number >= 1
  ) holes
  where holes.candidate >= 1
    and not exists (
      select 1
      from public.profiles taken
      where taken.collector_number = holes.candidate
    );

  if new.collector_number is null then
    raise exception 'no collector number left';
  end if;

  return new;
end;
$$;

create trigger profiles_assign_collector_number
before insert on public.profiles
for each row
execute function public.profiles_assign_collector_number();

revoke execute on function public.profiles_assign_collector_number() from public, anon, authenticated;

comment on column public.profiles.collector_number is
  'Shown as Collector #N. The next sign-up takes the lowest positive integer no living profile holds. Deleting the only account makes the next sign-up #1. Deleting #3 of 1-3 makes the next #3. Deleting #2 of 1-3 makes the next #2. A living number never changes, and nobody else is renumbered.';
